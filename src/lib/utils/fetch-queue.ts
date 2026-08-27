/**
 * Concurrency-limited fetch queue with priority lanes and client timeout.
 *
 * The dashboard mounts ~26 independent Jotai atoms on page load, each firing
 * its own fetch() with no coordination. Firing all of them at once means fast
 * queries (e.g. model-stats, ~1.4s) get stuck behind slow ones (e.g.
 * active-users, ~6s) competing for the same DB connection pool — so nothing
 * renders quickly even when some data genuinely is fast, and it re-creates
 * the connection-pool contention that caused the APT-603 incident.
 *
 * This wraps fetch() with a small semaphore so only `MAX_CONCURRENT` requests
 * are in flight at once. Everything else queues client-side and fires as soon
 * as a slot frees up.
 *
 * ### Priority lanes (APT-685)
 * Pass `queuePriority: 'high'` to jump ahead of normal-priority items in the
 * queue. Each priority tier is FIFO, with high-priority work always selected
 * before normal work. Above-the-fold KPI atoms use 'high'; everything
 * else defaults to 'normal'.
 *
 * ### Client-side timeout (APT-685)
 * A default `CLIENT_TIMEOUT_MS` is applied via `AbortSignal.timeout` unless
 * the caller supplies its own `signal` in `RequestInit`. When the signal fires
 * (timeout **or** caller abort) the queue slot is released immediately so
 * waiting requests are not blocked by a hung connection.
 */

const MAX_CONCURRENT = 6;

/** Default client-side timeout per request (30 s). */
const CLIENT_TIMEOUT_MS = 30_000;

export type FetchPriority = "high" | "normal";

export interface QueuedFetchOptions extends RequestInit {
	/**
	 * Queue priority — does **not** map to the fetch `priority` hint.
	 * - `'high'`   – jumps ahead of normal-priority items (use for above-the-fold KPIs).
	 * - `'normal'` – default FIFO ordering.
	 */
	queuePriority?: FetchPriority;
}

let activeCount = 0;
const highPriorityQueue: Array<() => void> = [];
const normalPriorityQueue: Array<() => void> = [];

function runNext() {
	if (activeCount >= MAX_CONCURRENT) return;
	// Each tier is FIFO; high-priority tasks are always chosen first.
	const next = highPriorityQueue.shift() ?? normalPriorityQueue.shift();
	if (next) {
		activeCount++;
		next();
	}
}

/**
 * Drop-in replacement for fetch(). Queues the request if MAX_CONCURRENT
 * requests are already in flight; otherwise fires immediately.
 *
 * Priority: 'high' items execute before any queued 'normal' items, while
 * preserving FIFO order within their own tier. Existing in-flight requests
 * are not affected.
 *
 * Timeout: a 30-second `AbortSignal.timeout` is applied automatically unless
 * the caller provides their own `signal`. On abort (timeout or caller cancel)
 * the queue slot is released so downstream requests can proceed.
 *
 * @example — above-the-fold KPI atom (high priority)
 * ```ts
 * const res = await queuedFetch(url, { queuePriority: 'high' });
 * ```
 *
 * @example — secondary widget (normal priority, default)
 * ```ts
 * const res = await queuedFetch(url);
 * ```
 */
export function queuedFetch(
	input: RequestInfo | URL,
	init?: QueuedFetchOptions,
): Promise<Response> {
	const { queuePriority = "normal", signal, ...restInit } = init ?? {};

	// Apply a default timeout signal unless the caller already supplies one.
	const effectiveSignal: AbortSignal =
		signal ?? AbortSignal.timeout(CLIENT_TIMEOUT_MS);

	return new Promise((resolve, reject) => {
		const task = () => {
			let released = false;
			const releaseSlot = () => {
				if (released) return;
				released = true;
				activeCount--;
				runNext();
			};

			// If the signal is already aborted before we dequeue, bail early and
			// free the slot so the next task can run without waiting.
			if (effectiveSignal.aborted) {
				releaseSlot();
				reject(
					effectiveSignal.reason instanceof Error
						? effectiveSignal.reason
						: new DOMException("Aborted", "AbortError"),
				);
				return;
			}

			// Fetch normally rejects on abort. Releasing here also protects the
			// queue if the underlying request takes time to settle after a signal.
			const handleAbort = releaseSlot;
			effectiveSignal.addEventListener("abort", handleAbort, { once: true });

			fetch(input, { ...restInit, signal: effectiveSignal })
				.then(resolve, (err: unknown) => {
					reject(err);
				})
				.finally(() => {
					effectiveSignal.removeEventListener("abort", handleAbort);
					releaseSlot();
				});
		};

		if (activeCount < MAX_CONCURRENT) {
			activeCount++;
			task();
		} else if (queuePriority === "high") {
			// High-priority tasks run before normal tasks, FIFO within the tier.
			highPriorityQueue.push(task);
		} else {
			// Normal-priority: standard FIFO append.
			normalPriorityQueue.push(task);
		}
	});
}
