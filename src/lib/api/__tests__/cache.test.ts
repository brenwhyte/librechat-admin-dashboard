/**
 * Tests for single-flight cache coalescing (APT-685).
 *
 * Verifies:
 *  - Concurrent callers sharing a key await one producer (single-flight).
 *  - Failed producers are never written to the main cache.
 *  - In-flight entries are cleared on both resolve and reject so the next
 *    caller after a failure triggers a fresh producer.
 *  - Existing TTL/max-size semantics are preserved.
 */

import { buildCacheKey, clearCache, withCache } from "../cache";

beforeEach(() => {
	clearCache();
});

describe("withCache — basic TTL semantics (preserved)", () => {
	it("returns cached value within TTL without calling fn again", async () => {
		const fn = jest.fn().mockResolvedValue("result");

		const first = await withCache("key", fn, 10_000);
		const second = await withCache("key", fn, 10_000);

		expect(first).toBe("result");
		expect(second).toBe("result");
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("re-calls fn after TTL expires", async () => {
		jest.useFakeTimers();
		const fn = jest.fn().mockResolvedValue("fresh");

		await withCache("key", fn, 100);
		jest.advanceTimersByTime(200);
		await withCache("key", fn, 100);

		expect(fn).toHaveBeenCalledTimes(2);
		jest.useRealTimers();
	});
});

describe("withCache — single-flight coalescing (APT-685)", () => {
	it("calls fn exactly once for concurrent requests to the same key", async () => {
		let resolveProducer!: (value: string) => void;
		const producerPromise = new Promise<string>((res) => {
			resolveProducer = res;
		});
		const fn = jest.fn(() => producerPromise);

		// Fire 5 concurrent callers before the producer resolves.
		const results = Promise.all([
			withCache("flight-key", fn, 10_000),
			withCache("flight-key", fn, 10_000),
			withCache("flight-key", fn, 10_000),
			withCache("flight-key", fn, 10_000),
			withCache("flight-key", fn, 10_000),
		]);

		resolveProducer("coalesced");
		const values = await results;

		// All callers get the same value.
		expect(values).toEqual([
			"coalesced",
			"coalesced",
			"coalesced",
			"coalesced",
			"coalesced",
		]);
		// fn was only invoked once despite 5 concurrent calls.
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("does not cache failures — next caller retries", async () => {
		const fn = jest
			.fn()
			.mockRejectedValueOnce(new Error("db timeout"))
			.mockResolvedValueOnce("retry-ok");

		// First call fails.
		await expect(withCache("retry-key", fn, 10_000)).rejects.toThrow(
			"db timeout",
		);

		// Second call should get a fresh attempt (not a cached error).
		const result = await withCache("retry-key", fn, 10_000);
		expect(result).toBe("retry-ok");
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it("in-flight entry is cleared after a rejection so concurrent failure does not block forever", async () => {
		let rejectProducer!: (err: Error) => void;
		const failingProducer = new Promise<string>((_, rej) => {
			rejectProducer = rej;
		});
		const fn = jest.fn(() => failingProducer);

		// Two concurrent callers.
		const p1 = withCache("fail-key", fn, 10_000);
		const p2 = withCache("fail-key", fn, 10_000);

		rejectProducer(new Error("gone"));

		await expect(p1).rejects.toThrow("gone");
		await expect(p2).rejects.toThrow("gone");

		// fn was only invoked once (coalesced during flight).
		expect(fn).toHaveBeenCalledTimes(1);

		// After settlement the in-flight entry should be gone;
		// a new call should invoke fn again.
		const fn2 = jest.fn().mockResolvedValue("recovered");
		await withCache("fail-key", fn2, 10_000);
		expect(fn2).toHaveBeenCalledTimes(1);
	});
});

describe("buildCacheKey", () => {
	it("includes routeName and sorted query params", () => {
		const req = new Request(
			"https://example.com/api/test?end=2024-02-01&start=2024-01-01",
		);
		const key = buildCacheKey("active-users", req);
		expect(key).toBe("active-users:end=2024-02-01&start=2024-01-01");
	});

	it("produces an empty params segment when there are no query params", () => {
		const req = new Request("https://example.com/api/test");
		const key = buildCacheKey("all-user", req);
		expect(key).toBe("all-user:");
	});
});
