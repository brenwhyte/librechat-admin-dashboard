/**
 * Simple in-memory cache with TTL for API route responses.
 *
 * The dashboard fires ~14 parallel DB queries on every page load.
 * Without caching, each request triggers a fresh MongoDB aggregation.
 * With multiple concurrent users this quickly exhausts the connection pool
 * and causes timeouts (especially on resource-constrained instances like Cosmos DB M20).
 *
 * This cache ensures that identical queries within the TTL window
 * return cached results instead of hitting the database again.
 */

interface CacheEntry<T> {
	data: T;
	expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

/** Default TTL: 30 seconds */
const DEFAULT_TTL_MS = 30_000;

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
 * Execute a function with caching. If a cached result exists for the given key
 * and hasn't expired, it is returned immediately without calling `fn`.
 *
 * @param key - Unique cache key (typically: route name + query params)
 * @param fn - Async function that produces the data (e.g. a repository call)
 * @param ttlMs - Time-to-live in milliseconds (default: 30s)
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

	if (cached && cached.expiresAt > now) {
		return cached.data;
	}

	const data = await fn();

	// Enforce max size: if full, delete oldest entry
	if (cache.size >= MAX_CACHE_SIZE) {
		const firstKey = cache.keys().next().value;
		if (firstKey !== undefined) {
			cache.delete(firstKey);
		}
	}

	cache.set(key, { data, expiresAt: now + ttlMs });

	return data;
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
 */
export function clearCache(): void {
	cache.clear();
}
