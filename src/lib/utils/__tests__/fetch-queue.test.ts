/**
 * Tests for fetch-queue priority lanes and caller-supplied signal handling (APT-685).
 *
 * Verifies:
 *  - queuedFetch is backward-compatible: works without options, still returns
 *    a Response.
 *  - High-priority tasks are dequeued before normal-priority tasks (FIFO within
 *    each tier).
 *  - A caller-supplied AbortSignal is forwarded to fetch() unchanged.
 *  - When a caller-supplied signal fires the queue slot is released immediately
 *    so waiting requests are not blocked.
 *  - No default timeout is injected when no signal is provided.
 */

import { queuedFetch } from "../fetch-queue";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a Response stub for use in fetch mocks. */
function makeResponse(body = "ok", status = 200): Response {
	return new Response(body, { status });
}

/**
 * Return a controllable fetch mock plus its resolution handle.
 * Each element in `sequence` represents one call to fetch():
 *   - `'hang'`   → the promise never settles (simulates slow DB)
 *   - `Response` → the promise resolves immediately with that response
 *   - `Error`    → the promise rejects with that error
 */
type MockBehaviour = "hang" | Response | Error;

function buildFetchMock(sequence: MockBehaviour[]) {
	const resolvers: Array<() => void> = [];
	let callIndex = 0;

	const mockFn = jest.fn((_input: RequestInfo | URL, _init?: RequestInit) => {
		const behaviour = sequence[callIndex++] ?? makeResponse();
		if (behaviour === "hang") {
			return new Promise<Response>((res) => {
				resolvers.push(() => res(makeResponse()));
			});
		}
		if (behaviour instanceof Error) {
			return Promise.reject(behaviour);
		}
		return Promise.resolve(behaviour);
	});

	return { mockFn, resolvers };
}

// ---------------------------------------------------------------------------
// Fixture: isolate module state between tests by resetting the module registry
// ---------------------------------------------------------------------------

// We need to reset the module between tests to clear activeCount / queue.
// Jest's module isolation: re-import via jest.isolateModules.

async function freshQueuedFetch() {
	let fn!: typeof queuedFetch;
	jest.isolateModules(() => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		fn = (require("../fetch-queue") as { queuedFetch: typeof queuedFetch })
			.queuedFetch;
	});
	return fn;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("queuedFetch — backward compatibility", () => {
	it("resolves with a Response when called without options", async () => {
		const isolated = await freshQueuedFetch();
		const mockResponse = makeResponse("hello");
		global.fetch = jest.fn().mockResolvedValue(mockResponse);

		const res = await isolated("https://example.com/api/test");

		expect(res).toBe(mockResponse);
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	it("passes through normal fetch init options", async () => {
		const isolated = await freshQueuedFetch();
		global.fetch = jest.fn().mockResolvedValue(makeResponse());

		await isolated("https://example.com/api/test", {
			method: "POST",
			headers: { "x-custom": "value" },
		});

		const callArgs = (global.fetch as jest.Mock).mock.calls[0] as [
			RequestInfo | URL,
			RequestInit,
		];
		expect(callArgs[1]?.method).toBe("POST");
		expect((callArgs[1]?.headers as Record<string, string>)?.["x-custom"]).toBe(
			"value",
		);
	});

	it("does not inject a signal when none is provided by the caller", async () => {
		const isolated = await freshQueuedFetch();
		global.fetch = jest.fn().mockResolvedValue(makeResponse());

		await isolated("https://example.com/api/test");

		const callArgs = (global.fetch as jest.Mock).mock.calls[0] as [
			RequestInfo | URL,
			RequestInit,
		];
		// No signal should be present — no default timeout is injected.
		expect(callArgs[1]?.signal).toBeUndefined();
	});
});

describe("queuedFetch — priority lanes (APT-685)", () => {
	it("dequeues high-priority tasks before normal-priority tasks", async () => {
		const isolated = await freshQueuedFetch();

		// We'll track the order in which tasks actually execute via fetch calls.
		const executionOrder: string[] = [];

		// Fill all 4 slots with hanging requests so the next ones queue.
		const hangResolvers: Array<(r: Response) => void> = [];
		global.fetch = jest.fn().mockImplementation((input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith("https://hang")) {
				return new Promise<Response>((res) => hangResolvers.push(res));
			}
			executionOrder.push(url);
			return Promise.resolve(makeResponse());
		});

		// Occupy all 4 slots.
		const hangPromises = Array.from({ length: 4 }, (_, i) =>
			isolated(`https://hang/${i}`),
		);

		// Enqueue in order: normal-a, normal-b, high-c, normal-d, high-e
		const normalA = isolated("https://example.com/normal-a");
		const normalB = isolated("https://example.com/normal-b");
		const highC = isolated("https://example.com/high-c", {
			queuePriority: "high",
		});
		const normalD = isolated("https://example.com/normal-d");
		const highE = isolated("https://example.com/high-e", {
			queuePriority: "high",
		});

		// Release slots one by one. The separate priority lanes retain FIFO order
		// inside each tier: high-c, high-e, then the normal requests in arrival order.
		hangResolvers[0]?.(makeResponse());
		await hangPromises[0];
		// Wait a tick for the queue to drain one item.
		await Promise.resolve();

		hangResolvers[1]?.(makeResponse());
		await hangPromises[1];
		await Promise.resolve();

		hangResolvers[2]?.(makeResponse());
		await hangPromises[2];
		await Promise.resolve();

		hangResolvers[3]?.(makeResponse());
		await hangPromises[3];
		await Promise.resolve();

		// Drain remaining tasks.
		await Promise.all([normalA, normalB, highC, normalD, highE]);

		expect(executionOrder).toEqual([
			"https://example.com/high-c",
			"https://example.com/high-e",
			"https://example.com/normal-a",
			"https://example.com/normal-b",
			"https://example.com/normal-d",
		]);
	});
});

describe("queuedFetch — caller-supplied signal (APT-685)", () => {
	it("forwards a caller-supplied signal to fetch()", async () => {
		const isolated = await freshQueuedFetch();
		const controller = new AbortController();
		global.fetch = jest.fn().mockResolvedValue(makeResponse());

		await isolated("https://example.com/api/test", {
			signal: controller.signal,
		});

		const callArgs = (global.fetch as jest.Mock).mock.calls[0] as [
			RequestInfo | URL,
			RequestInit,
		];
		expect(callArgs[1]?.signal).toBe(controller.signal);
	});

	it("rejects with the signal reason when the signal is already aborted", async () => {
		const isolated = await freshQueuedFetch();

		// Provide a signal that is already aborted to simulate an instant abort.
		const controller = new AbortController();
		controller.abort(new DOMException("Timeout", "TimeoutError"));

		global.fetch = jest.fn().mockReturnValue(
			new Promise(() => {
				/* never settles */
			}),
		);

		await expect(
			isolated("https://example.com/slow", { signal: controller.signal }),
		).rejects.toMatchObject({ name: expect.stringMatching(/Abort|Timeout/) });
	});

	it("releases the queue slot on signal abort so subsequent requests proceed", async () => {
		const isolated = await freshQueuedFetch();

		const controller = new AbortController();
		controller.abort(new DOMException("Cancelled", "AbortError"));

		const normalResponse = makeResponse("normal-ok");
		global.fetch = jest
			.fn()
			.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
				if (init?.signal === controller.signal) {
					// Short-circuit path should not be reached for a pre-aborted signal.
					return new Promise(() => {
						/* hang */
					});
				}
				return Promise.resolve(normalResponse);
			});

		// Fire the aborted request (slot taken, immediately rejected, slot released).
		const aborted = isolated("https://example.com/aborted", {
			signal: controller.signal,
		});

		// Fire a normal request right after.
		const normal = isolated("https://example.com/normal");

		// The aborted call should reject.
		await expect(aborted).rejects.toBeDefined();
		// The normal call should resolve because the slot was released.
		const res = await normal;
		expect(res).toBe(normalResponse);
	});
});
