import {
	type Collection,
	type Db,
	MongoClient,
	type MongoClientOptions,
} from "mongodb";

/**
 * MongoDB Connection Manager (READ-ONLY)
 *
 * This dashboard only reads statistics from the database.
 * NO WRITE OPERATIONS are supported or allowed.
 *
 * Handles connection pooling and database access with proper configuration.
 * The database name is extracted from the connection URI or can be overridden
 * via MONGODB_DB_NAME environment variable.
 */

// Default to local development database if not specified
const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/LibreChat";
const dbNameOverride = process.env.MONGODB_DB_NAME;

/**
 * Extract database name from MongoDB URI
 * Format: mongodb+srv://user:pass@host/database?options
 */
function extractDbNameFromUri(connectionUri: string): string | null {
	try {
		const url = new URL(connectionUri);
		const pathname = url.pathname;
		// Remove leading slash and return database name
		const dbName = pathname.slice(1).split("?")[0];
		return dbName || null;
	} catch {
		// Fallback for non-standard URIs
		const match = connectionUri.match(/\/([^/?]+)(\?|$)/);
		return match?.[1] || null;
	}
}

const dbNameFromUri = extractDbNameFromUri(uri);
const dbName: string = dbNameOverride || dbNameFromUri || "LibreChat";

if (!dbNameOverride && !dbNameFromUri) {
	console.warn(
		"[MongoDB] Database name not found in URI, using default: LibreChat",
	);
}

// Log warning if both are set but different
if (dbNameOverride && dbNameFromUri && dbNameOverride !== dbNameFromUri) {
	console.warn(
		`[MongoDB] Warning: MONGODB_DB_NAME (${dbNameOverride}) differs from URI database (${dbNameFromUri}). ` +
			`Using MONGODB_DB_NAME: ${dbNameOverride}`,
	);
}

/**
 * MongoDB client options for a read-only dashboard sharing a DB with LibreChat.
 *
 * Pool size rationale:
 * - The dashboard fires ~14 parallel queries on page load
 * - Server-side caching (30s TTL) means most requests never hit the DB
 * - Keep pool small to avoid starving the main LibreChat app of connections
 * - Cosmos DB M20 has limited connection capacity (~200-500 total)
 * - maxPoolSize: 20 handles cold-start bursts; caching handles the rest
 */
const clientOptions: MongoClientOptions = {
	maxPoolSize: 20,
	minPoolSize: 2,
	maxIdleTimeMS: 120000,
	connectTimeoutMS: 30000,
	socketTimeoutMS: 60000,
	serverSelectionTimeoutMS: 30000,
	retryWrites: false, // Cosmos DB compatibility
	retryReads: true,
};

// Global client instance for connection reuse
let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

/**
 * Get or create MongoDB client with connection pooling
 */
async function getClient(): Promise<MongoClient> {
	if (clientPromise) {
		return clientPromise;
	}

	client = new MongoClient(uri, clientOptions);
	clientPromise = client.connect();

	// Handle connection errors
	clientPromise.catch((error) => {
		console.error("[MongoDB] Connection failed:", error);
		client = null;
		clientPromise = null;
	});

	return clientPromise;
}

/**
 * Get database instance
 */
export async function getDatabase(): Promise<Db> {
	const mongoClient = await getClient();
	return mongoClient.db(dbName);
}

/**
 * Get collection by name with type safety
 */
export async function getCollection<T extends Document = Document>(
	collectionName: string,
): Promise<Collection<T>> {
	const db = await getDatabase();
	return db.collection<T>(collectionName);
}

/**
 * Collection names enum for type safety
 */
export const Collections = {
	MESSAGES: "messages",
	CONVERSATIONS: "conversations",
	USERS: "users",
	AGENTS: "agents",
	TOOL_CALLS: "toolcalls",
	TRANSACTIONS: "transactions",
	FILES: "files",
} as const;

export type CollectionName = (typeof Collections)[keyof typeof Collections];

/**
 * Maximum time (in ms) the MongoDB **server** is allowed to spend on a single query.
 *
 * CRITICAL: This is different from socketTimeoutMS which only controls the driver side.
 * Without maxTimeMS, a slow aggregation pipeline (e.g. $lookup without index) will continue
 * running on the DB even after the Node.js driver gives up, holding connections and RUs.
 * On Cosmos DB M20, this can starve the main LibreChat app of all available resources.
 *
 * We use tiered timeouts based on query complexity:
 * - QUERY_MAX_TIME_MS (60s): All queries use this timeout. After the $lookup elimination
 *   refactor (Phase 2.5), all queries are single-collection operations with date-range filters.
 */
export const QUERY_MAX_TIME_MS = 60_000;

/**
 * Graceful shutdown handler
 */
export async function closeConnection(): Promise<void> {
	if (client) {
		await client.close();
		client = null;
		clientPromise = null;
	}
}

// Export for backward compatibility
export { getCollection as connectDB };
