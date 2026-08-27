/**
 * Concurrency-limited fetch queue with priority lanes.
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
 * ### Concurrency bound
 * MAX_CONCURRENT is set to 4.  Four parallel requests per tab gives the
 * server-side connection pool enough headroom to service each query without
 * contention, while still allowing meaningful parallelism (high-priority KPIs
 * and the first batch of secondary widgets all start without waiting for the
 * full queue to drain).
 *
 * ### Priority lanes (APT-685)
 * Pass `queuePriority: 'high'` to jump ahead of normal-priority items in the
 * queue. Each priority tier is FIFO, with high-priority work always selected
 * before normal work. Above-the-fold KPI atoms use 'high'; everything
 * else defaults to 'normal'.
 *
 * ### Caller-supplied signals
 * No default timeout is injected by this module.  If a caller provides
 * `signal` in `RequestInit` it is forwarded verbatim to fetch() and the queue
 * slot is released as soon as the signal fires, so a timed-out or cancelled
 * request does not block waiting tasks.
 */

const MAX_CONCURRENT = 4;

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
 * Drop-in replacement for fetch(). Queues the request if MAX_CONCURRENT (4)
 * requests are already in flight; otherwise fires immediately.
 *
 * Priority: 'high' items execute before any queued 'normal' items, while
 * preserving FIFO order within their own tier. Existing in-flight requests
 * are not affected.
 *
 * Signal: if a `signal` is provided it is forwarded to fetch() unchanged.
 * When the signal fires (caller abort or caller-managed timeout) the queue
 * slot is released immediately so waiting requests can proceed.
 * No default timeout is applied by this function.
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
 *
 * @example — caller-managed timeout
 * ```ts
 * const res = await queuedFetch(url, { signal: AbortSignal.timeout(15_000) });
 * ```
 */
export function queuedFetch(
	input: RequestInfo | URL,
	init?: QueuedFetchOptions,
): Promise<Response> {
	const { queuePriority = "normal", signal, ...restInit } = init ?? {};

	return new Promise((resolve, reject) => {
		const task = () => {
			let released = false;
			const releaseSlot = () => {
				if (released) return;
				released = true;
				activeCount--;
				runNext();
			};

			// If a signal was provided and is already aborted before we dequeue,
			// bail early and free the slot so the next task can run without waiting.
			if (signal?.aborted) {
				releaseSlot();
				reject(
					signal.reason instanceof Error
						? signal.reason
						: new DOMException("Aborted", "AbortError"),
				);
				return;
			}

			// If a signal was provided, release the slot as soon as it fires so a
			// timed-out or cancelled request does not block waiting tasks.
			const handleAbort = releaseSlot;
			if (signal) {
				signal.addEventListener("abort", handleAbort, { once: true });
			}

			const fetchInit: RequestInit = signal
				? { ...restInit, signal }
				: { ...restInit };

			fetch(input, fetchInit)
				.then(resolve, (err: unknown) => {
					reject(err);
				})
				.finally(() => {
					if (signal) {
						signal.removeEventListener("abort", handleAbort);
					}
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
