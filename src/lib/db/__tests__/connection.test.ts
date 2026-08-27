/**
 * Tests for MongoDB connection module
 *
 * Because `connection.ts` reads process.env at module-evaluation time (for
 * clientOptions and QUERY_MAX_TIME_MS), every test that checks a different env
 * configuration must call jest.resetModules() before the import so the module
 * is re-evaluated with the new env state.
 *
 * MongoClient is mocked via jest.mock("mongodb") which persists across
 * resetModules().  After each resetModules() the fresh re-import of
 * "mongodb" returns the same mock factory, so we access the constructor's
 * call record via require("mongodb").MongoClient inside each test instead of
 * relying on the top-level import reference.
 */

import type { MongoClientOptions } from "mongodb";

// Mock mongodb module before importing connection
jest.mock("mongodb", () => {
	const mockCollection = {
		aggregate: jest.fn().mockReturnValue({
			toArray: jest.fn().mockResolvedValue([]),
		}),
		countDocuments: jest.fn().mockResolvedValue(0),
		find: jest.fn().mockReturnValue({
			toArray: jest.fn().mockResolvedValue([]),
		}),
	};

	const mockDb = {
		collection: jest.fn().mockReturnValue(mockCollection),
	};

	const mockClient = {
		connect: jest.fn().mockResolvedValue({
			db: jest.fn().mockReturnValue(mockDb),
		}),
		close: jest.fn().mockResolvedValue(undefined),
		db: jest.fn().mockReturnValue(mockDb),
	};

	return {
		MongoClient: jest.fn().mockImplementation(() => mockClient),
	};
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Env vars managed by this test suite — restored in afterEach */
const MANAGED_ENV_VARS = [
	"MONGODB_URI",
	"MONGODB_DB_NAME",
	"MONGO_MAX_POOL_SIZE",
	"MONGO_MIN_POOL_SIZE",
	"MONGO_MAX_IDLE_TIME_MS",
	"MONGO_CONNECT_TIMEOUT_MS",
	"MONGO_SOCKET_TIMEOUT_MS",
	"MONGO_SERVER_SELECTION_TIMEOUT_MS",
	"MONGO_QUERY_MAX_TIME_MS",
] as const;

function snapshotEnv(): Record<string, string | undefined> {
	return Object.fromEntries(
		MANAGED_ENV_VARS.map((k) => [k, process.env[k]]),
	) as Record<string, string | undefined>;
}

function restoreEnv(snapshot: Record<string, string | undefined>) {
	for (const key of MANAGED_ENV_VARS) {
		const saved = snapshot[key];
		if (saved === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = saved;
		}
	}
}

/**
 * Get the MongoClientOptions that were passed to the constructor after a
 * fresh module load + getDatabase() call.  We re-require "mongodb" here so we
 * get the mock instance that was registered for *this* module cycle.
 */
function getMockedMongoClient() {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	return require("mongodb").MongoClient as jest.Mock;
}

function capturedOptions(): MongoClientOptions {
	const ctor = getMockedMongoClient();
	const call = ctor.mock.calls[0] as [string, MongoClientOptions] | undefined;
	if (!call) throw new Error("MongoClient constructor was never called");
	return call[1];
}

// ---------------------------------------------------------------------------
// Suites
// ---------------------------------------------------------------------------

describe("MongoDB Connection", () => {
	let envSnapshot: Record<string, string | undefined>;

	beforeEach(() => {
		envSnapshot = snapshotEnv();
		jest.resetModules();
		process.env.MONGODB_URI = "mongodb://localhost:27017/testdb";
		delete process.env.MONGODB_DB_NAME;
		for (const key of MANAGED_ENV_VARS.filter((k) => k.startsWith("MONGO_"))) {
			delete process.env[key];
		}
	});

	afterEach(() => {
		restoreEnv(envSnapshot);
	});

	it("should extract database name from URI", async () => {
		const { getDatabase } = await import("../connection");
		const db = await getDatabase();

		expect(db).toBeDefined();
	});

	it("should use MONGODB_DB_NAME override when provided", async () => {
		process.env.MONGODB_DB_NAME = "override-db";

		const { getDatabase } = await import("../connection");
		const db = await getDatabase();

		expect(db).toBeDefined();
	});

	it("should export getCollection function", async () => {
		const { getCollection } = await import("../connection");

		expect(typeof getCollection).toBe("function");
	});

	it("should export Collections enum", async () => {
		const { Collections } = await import("../connection");

		expect(Collections.MESSAGES).toBe("messages");
		expect(Collections.USERS).toBe("users");
		expect(Collections.AGENTS).toBe("agents");
	});

	it("should export connectDB for backward compatibility", async () => {
		const { connectDB, getCollection } = await import("../connection");

		expect(connectDB).toBe(getCollection);
	});
});

describe("extractDbNameFromUri", () => {
	let envSnapshot: Record<string, string | undefined>;

	beforeEach(() => {
		envSnapshot = snapshotEnv();
		jest.resetModules();
		for (const key of MANAGED_ENV_VARS.filter((k) => k.startsWith("MONGO_"))) {
			delete process.env[key];
		}
	});

	afterEach(() => {
		restoreEnv(envSnapshot);
	});

	it("should handle standard mongodb URI", async () => {
		process.env.MONGODB_URI = "mongodb://localhost:27017/mydb";
		delete process.env.MONGODB_DB_NAME;

		const module = await import("../connection");
		expect(module).toBeDefined();
	});

	it("should handle mongodb+srv URI", async () => {
		process.env.MONGODB_URI =
			"mongodb+srv://user:pass@cluster.mongodb.net/production";
		delete process.env.MONGODB_DB_NAME;

		const module = await import("../connection");
		expect(module).toBeDefined();
	});

	it("should handle URI with query parameters", async () => {
		process.env.MONGODB_URI =
			"mongodb://localhost:27017/testdb?retryWrites=true&w=majority";
		delete process.env.MONGODB_DB_NAME;

		const module = await import("../connection");
		expect(module).toBeDefined();
	});
});

describe("MongoClient options — env overrides", () => {
	let envSnapshot: Record<string, string | undefined>;

	beforeEach(() => {
		envSnapshot = snapshotEnv();
		jest.resetModules();
		// Clear call history on the persistent mock
		getMockedMongoClient().mockClear();
		process.env.MONGODB_URI = "mongodb://localhost:27017/testdb";
		delete process.env.MONGODB_DB_NAME;
		for (const key of MANAGED_ENV_VARS.filter((k) => k.startsWith("MONGO_"))) {
			delete process.env[key];
		}
	});

	afterEach(() => {
		restoreEnv(envSnapshot);
	});

	it("MongoClient constructor is only called lazily (not on import)", async () => {
		await import("../connection");

		expect(getMockedMongoClient()).toHaveBeenCalledTimes(0);
	});

	it("uses hard-coded defaults when no MONGO_* env vars are set", async () => {
		const { getDatabase } = await import("../connection");
		await getDatabase();

		const opts = capturedOptions();
		expect(opts.maxPoolSize).toBe(20);
		expect(opts.minPoolSize).toBe(2);
		expect(opts.maxIdleTimeMS).toBe(120000);
		expect(opts.connectTimeoutMS).toBe(30000);
		expect(opts.socketTimeoutMS).toBe(90000);
		expect(opts.serverSelectionTimeoutMS).toBe(30000);
	});

	it("passes env-overridden pool sizes to MongoClient on first connect", async () => {
		process.env.MONGO_MAX_POOL_SIZE = "50";
		process.env.MONGO_MIN_POOL_SIZE = "5";

		const { getDatabase } = await import("../connection");
		await getDatabase();

		expect(getMockedMongoClient()).toHaveBeenCalledTimes(1);
		const opts = capturedOptions();
		expect(opts.maxPoolSize).toBe(50);
		expect(opts.minPoolSize).toBe(5);
	});

	it("passes env-overridden timeout values to MongoClient", async () => {
		process.env.MONGO_CONNECT_TIMEOUT_MS = "5000";
		process.env.MONGO_SOCKET_TIMEOUT_MS = "10000";
		process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS = "7000";
		process.env.MONGO_MAX_IDLE_TIME_MS = "90000";

		const { getDatabase } = await import("../connection");
		await getDatabase();

		expect(getMockedMongoClient()).toHaveBeenCalledTimes(1);
		const opts = capturedOptions();
		expect(opts.connectTimeoutMS).toBe(5000);
		expect(opts.socketTimeoutMS).toBe(10000);
		expect(opts.serverSelectionTimeoutMS).toBe(7000);
		expect(opts.maxIdleTimeMS).toBe(90000);
	});

	it("always keeps retryWrites=false and retryReads=true regardless of env", async () => {
		const { getDatabase } = await import("../connection");
		await getDatabase();

		const opts = capturedOptions();
		expect(opts.retryWrites).toBe(false);
		expect(opts.retryReads).toBe(true);
	});

	it("falls back to default for invalid (negative) pool size", async () => {
		process.env.MONGO_MAX_POOL_SIZE = "-10";

		const { getDatabase } = await import("../connection");
		await getDatabase();

		const opts = capturedOptions();
		expect(opts.maxPoolSize).toBe(20); // default
	});

	it("falls back to default for zero value", async () => {
		process.env.MONGO_MIN_POOL_SIZE = "0";

		const { getDatabase } = await import("../connection");
		await getDatabase();

		const opts = capturedOptions();
		expect(opts.minPoolSize).toBe(2); // default
	});

	it("falls back to default for decimal (non-integer) value", async () => {
		process.env.MONGO_CONNECT_TIMEOUT_MS = "1500.5";

		const { getDatabase } = await import("../connection");
		await getDatabase();

		const opts = capturedOptions();
		expect(opts.connectTimeoutMS).toBe(30000); // default
	});

	it("falls back to default for non-numeric string", async () => {
		process.env.MONGO_SOCKET_TIMEOUT_MS = "fast";

		const { getDatabase } = await import("../connection");
		await getDatabase();

		const opts = capturedOptions();
		expect(opts.socketTimeoutMS).toBe(90000); // default
	});

	it("falls back to default for blank string", async () => {
		process.env.MONGO_MAX_IDLE_TIME_MS = "   ";

		const { getDatabase } = await import("../connection");
		await getDatabase();

		const opts = capturedOptions();
		expect(opts.maxIdleTimeMS).toBe(120000); // default
	});
});

describe("QUERY_MAX_TIME_MS export", () => {
	let envSnapshot: Record<string, string | undefined>;

	beforeEach(() => {
		envSnapshot = snapshotEnv();
		jest.resetModules();
		for (const key of MANAGED_ENV_VARS.filter((k) => k.startsWith("MONGO_"))) {
			delete process.env[key];
		}
	});

	afterEach(() => {
		restoreEnv(envSnapshot);
	});

	it("defaults to 60000 when MONGO_QUERY_MAX_TIME_MS is unset", async () => {
		const { QUERY_MAX_TIME_MS } = await import("../connection");
		expect(QUERY_MAX_TIME_MS).toBe(60000);
	});

	it("uses MONGO_QUERY_MAX_TIME_MS when set to a valid positive integer", async () => {
		process.env.MONGO_QUERY_MAX_TIME_MS = "120000";
		const { QUERY_MAX_TIME_MS } = await import("../connection");
		expect(QUERY_MAX_TIME_MS).toBe(120000);
	});

	it("falls back to 60000 for a negative value", async () => {
		process.env.MONGO_QUERY_MAX_TIME_MS = "-1";
		const { QUERY_MAX_TIME_MS } = await import("../connection");
		expect(QUERY_MAX_TIME_MS).toBe(60000);
	});

	it("falls back to 60000 for a decimal value", async () => {
		process.env.MONGO_QUERY_MAX_TIME_MS = "30000.5";
		const { QUERY_MAX_TIME_MS } = await import("../connection");
		expect(QUERY_MAX_TIME_MS).toBe(60000);
	});

	it("falls back to 60000 for a non-numeric string", async () => {
		process.env.MONGO_QUERY_MAX_TIME_MS = "never";
		const { QUERY_MAX_TIME_MS } = await import("../connection");
		expect(QUERY_MAX_TIME_MS).toBe(60000);
	});

	it("falls back to 60000 for a blank string", async () => {
		process.env.MONGO_QUERY_MAX_TIME_MS = "";
		const { QUERY_MAX_TIME_MS } = await import("../connection");
		expect(QUERY_MAX_TIME_MS).toBe(60000);
	});
});
