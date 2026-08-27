/**
 * Simple in-memory cache with TTL for API route responses.
 *
 * The dashboard fires ~26 parallel DB queries on every page load.
 * Without caching, each request triggers a fresh MongoDB aggregation.
 * With multiple concurrent users this quickly exhausts the connection pool
 * and causes timeouts (especially on resource-constrained instances like Cosmos DB M20).
 *
 * This cache ensures that identical queries within the TTL window
 * return cached results instead of hitting the database again.
 *
 * ### Single-flight coalescing (APT-685)
 * When two requests arrive simultaneously for the same key that is not yet
 * in the cache, only one producer (`fn`) is executed.  All concurrent
 * callers await the same promise so the DB is queried exactly once.
 * Guarantees:
 *  - Failures are **never** written to the main cache.
 *  - The in-flight entry is **always** removed on settle (resolve or reject),
 *    so the next caller after a failure will retry rather than wait forever.
 */

interface CacheEntry<T> {
	data: T;
	expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

/**
 * Tracks in-flight producer promises keyed by cache key.
 * Concurrent callers for the same key share one promise.
 * The entry is deleted (win or lose) before consumers re-examine the cache.
 */
const inFlight = new Map<string, Promise<unknown>>();

/** Default TTL: 5 minutes — dashboard data is historical and doesn't change second-to-second */
const DEFAULT_TTL_MS = 5 * 60_000;

/** Max cache entries to prevent unbounded memory growth */
const MAX_CACHE_SIZE = 200;

/**
 * Evict expired entries. Called periodically to keep memory bounded.
 */
function evictExpired(): void {
	const now = Date.now();
	for (const [key, entry] of cache) {
		if (entry.expiresAt <= now) {
			cache.delete(key);
		}
	}
}

// Run eviction every 60 seconds
let evictionInterval: ReturnType<typeof setInterval> | null = null;

function ensureEvictionRunning(): void {
	if (evictionInterval === null) {
		evictionInterval = setInterval(evictExpired, 60_000);
		// Don't prevent Node.js from exiting
		if (typeof evictionInterval === "object" && "unref" in evictionInterval) {
			evictionInterval.unref();
		}
	}
}

/**
 * Execute a function with caching + single-flight coalescing.
 *
 * Behaviour:
 * 1. Hot-path: cached entry not expired → return immediately.
 * 2. In-flight: another caller is already executing `fn` for this key →
 *    await the same promise (no second DB query).
 * 3. Cold-path: no cache, no in-flight → call `fn`, register the promise as
 *    in-flight, then on success write to cache and remove in-flight entry;
 *    on failure remove in-flight entry without caching the error.
 *
 * @param key   - Unique cache key (typically: route name + query params)
 * @param fn    - Async function that produces the data (e.g. a repository call)
 * @param ttlMs - Time-to-live in milliseconds (default: 5 min)
 * @returns The cached or freshly computed result
 *
 * @example
 * ```ts
 * const data = await withCache(
 *   `active-users:${start}:${end}`,
 *   () => getActiveUsers(validation.data),
 * );
 * ```
 */
export async function withCache<T>(
	key: string,
	fn: () => Promise<T>,
	ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
	ensureEvictionRunning();

	const now = Date.now();
	const cached = cache.get(key) as CacheEntry<T> | undefined;

	// 1. Serve from cache if still fresh.
	if (cached && cached.expiresAt > now) {
		return cached.data;
	}

	// 2. Coalesce: join an already-running producer instead of launching a new one.
	const existing = inFlight.get(key) as Promise<T> | undefined;
	if (existing) {
		return existing;
	}

	// 3. Cold path: launch producer, register as in-flight.
	const producer = fn().then(
		(data) => {
			// Success: write to cache, clear in-flight.
			inFlight.delete(key);

			// Enforce max size: if full, evict oldest entry.
			if (cache.size >= MAX_CACHE_SIZE) {
				const firstKey = cache.keys().next().value;
				if (firstKey !== undefined) {
					cache.delete(firstKey);
				}
			}

			cache.set(key, { data, expiresAt: Date.now() + ttlMs });
			return data;
		},
		(err: unknown) => {
			// Failure: clear in-flight, do NOT cache the error.
			inFlight.delete(key);
			throw err;
		},
	);

	inFlight.set(key, producer as Promise<unknown>);

	return producer;
}

/**
 * Build a cache key from a route name and request URL query parameters.
 * Ensures consistent key generation across API routes.
 */
export function buildCacheKey(routeName: string, request: Request): string {
	const url = new URL(request.url);
	const params = url.searchParams.toString();
	return `${routeName}:${params}`;
}

/**
 * Clear the entire cache. Useful for testing or forced refresh.
 * Also clears any in-flight entries so tests start clean.
 */
export function clearCache(): void {
	cache.clear();
	inFlight.clear();
}
