/**
 * Concurrency-limited fetch queue.
 *
 * The dashboard mounts ~26 independent Jotai atoms on page load, each firing
 * its own fetch() with no coordination. Firing all of them at once means fast
 * queries (e.g. model-stats, ~1.4s) get stuck behind slow ones (e.g.
 * active-users, ~6s) competing for the same DB connection pool — so nothing
 * renders quickly even when some data genuinely is fast, and it re-creates
 * the connection-pool contention that caused the APT-603 incident.
 *
 * This wraps fetch() with a small semaphore so only `MAX_CONCURRENT` requests
 * are in flight at once. Everything else queues client-side (FIFO) and fires
 * as soon as a slot frees up. Fast queries finish and render first; slow ones
 * queue behind them instead of all fighting for the pool simultaneously.
 */

const MAX_CONCURRENT = 6;

let activeCount = 0;
const queue: Array<() => void> = [];

function runNext() {
	if (activeCount >= MAX_CONCURRENT) return;
	const next = queue.shift();
	if (next) {
		activeCount++;
		next();
	}
}

/**
 * Drop-in replacement for fetch(). Queues the request if MAX_CONCURRENT
 * requests are already in flight; otherwise fires immediately.
 */
export function queuedFetch(
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<Response> {
	return new Promise((resolve, reject) => {
		const task = () => {
			fetch(input, init)
				.then(resolve, reject)
				.finally(() => {
					activeCount--;
					runNext();
				});
		};

		if (activeCount < MAX_CONCURRENT) {
			activeCount++;
			task();
		} else {
			queue.push(task);
		}
	});
}
