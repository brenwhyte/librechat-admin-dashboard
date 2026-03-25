/**
 * Recommended MongoDB Indexes for Performance Optimization
 *
 * Run these commands in MongoDB shell or use them in a migration script.
 * These indexes are critical for query performance on large datasets.
 */

export const RECOMMENDED_INDEXES = {
	messages: [
		// Primary query index - covers most date range queries
		{
			name: "idx_messages_createdAt_model_endpoint",
			keys: { createdAt: -1, model: 1, endpoint: 1 },
			options: { background: true },
		},
		// For parent message lookups
		{
			name: "idx_messages_messageId",
			keys: { messageId: 1 },
			options: { unique: true, background: true },
		},
		// For user activity queries
		{
			name: "idx_messages_user_createdAt",
			keys: { user: 1, createdAt: -1 },
			options: { background: true },
		},
		// For agent-specific queries
		{
			name: "idx_messages_sender_createdAt",
			keys: { sender: 1, createdAt: -1 },
			options: { background: true },
		},
		// For conversation-based grouping
		{
			name: "idx_messages_conversationId",
			keys: { conversationId: 1 },
			options: { background: true },
		},
		// Compound index for parent message joins
		{
			name: "idx_messages_parentMessageId",
			keys: { parentMessageId: 1 },
			options: { background: true, sparse: true },
		},
	],
	transactions: [
		// Primary query index for token statistics by date and type
		{
			name: "idx_transactions_createdAt_tokenType",
			keys: { createdAt: -1, tokenType: 1 },
			options: { background: true },
		},
		// For user-specific token queries
		{
			name: "idx_transactions_user_createdAt",
			keys: { user: 1, createdAt: -1 },
			options: { background: true },
		},
		// For model-specific token analysis
		{
			name: "idx_transactions_model_createdAt",
			keys: { model: 1, createdAt: -1 },
			options: { background: true },
		},
	],
	users: [
		{
			name: "idx_users_userId",
			keys: { userId: 1 },
			options: { unique: true, background: true },
		},
	],
	agents: [
		{
			name: "idx_agents_id",
			keys: { id: 1 },
			options: { unique: true, background: true },
		},
	],
	conversations: [
		// CRITICAL: Used by 7 $lookup operations in model-stats and agent-stats repositories.
		// Without this index, every $lookup triggers a full collection scan on conversations.
		// This is the single most impactful missing index for dashboard performance.
		{
			name: "idx_conversations_conversationId",
			keys: { conversationId: 1 },
			options: { background: true },
		},
		// For agent-related queries that filter by endpoint
		{
			name: "idx_conversations_endpoint",
			keys: { endpoint: 1 },
			options: { background: true },
		},
	],
	files: [
		// For files-processed date range queries
		{
			name: "idx_files_createdAt",
			keys: { createdAt: -1 },
			options: { background: true },
		},
	],
};

/**
 * MongoDB Shell commands to create indexes
 */
export const INDEX_CREATION_SCRIPT = `
// Messages collection indexes
db.messages.createIndex({ createdAt: -1, model: 1, endpoint: 1 }, { name: "idx_messages_createdAt_model_endpoint", background: true });
db.messages.createIndex({ messageId: 1 }, { name: "idx_messages_messageId", unique: true, background: true });
db.messages.createIndex({ user: 1, createdAt: -1 }, { name: "idx_messages_user_createdAt", background: true });
db.messages.createIndex({ sender: 1, createdAt: -1 }, { name: "idx_messages_sender_createdAt", background: true });
db.messages.createIndex({ conversationId: 1 }, { name: "idx_messages_conversationId", background: true });
db.messages.createIndex({ parentMessageId: 1 }, { name: "idx_messages_parentMessageId", background: true, sparse: true });

// Transactions collection indexes (for accurate token tracking)
db.transactions.createIndex({ createdAt: -1, tokenType: 1 }, { name: "idx_transactions_createdAt_tokenType", background: true });
db.transactions.createIndex({ user: 1, createdAt: -1 }, { name: "idx_transactions_user_createdAt", background: true });
db.transactions.createIndex({ model: 1, createdAt: -1 }, { name: "idx_transactions_model_createdAt", background: true });

// Users collection indexes
db.users.createIndex({ userId: 1 }, { name: "idx_users_userId", unique: true, background: true });

// Agents collection indexes
db.agents.createIndex({ id: 1 }, { name: "idx_agents_id", unique: true, background: true });

// Conversations collection indexes (CRITICAL for $lookup performance)
// Without these, 7 API routes perform full collection scans on every request
db.conversations.createIndex({ conversationId: 1 }, { name: "idx_conversations_conversationId", background: true });
db.conversations.createIndex({ endpoint: 1 }, { name: "idx_conversations_endpoint", background: true });

// Files collection indexes
db.files.createIndex({ createdAt: -1 }, { name: "idx_files_createdAt", background: true });

// Verify indexes
print("Messages indexes:");
printjson(db.messages.getIndexes());
print("Transactions indexes:");
printjson(db.transactions.getIndexes());
print("Users indexes:");
printjson(db.users.getIndexes());
print("Agents indexes:");
printjson(db.agents.getIndexes());
print("Conversations indexes:");
printjson(db.conversations.getIndexes());
print("Files indexes:");
printjson(db.files.getIndexes());
`;

/**
 * Performance recommendations
 */
export const PERFORMANCE_RECOMMENDATIONS = {
	connectionPooling: {
		description:
			"Pool sized conservatively to avoid starving the main LibreChat app. Server-side caching (30s TTL) handles request deduplication.",
		settings: {
			maxPoolSize: 20,
			minPoolSize: 2,
			maxIdleTimeMS: 120000,
			connectTimeoutMS: 30000,
			socketTimeoutMS: 60000,
			serverSelectionTimeoutMS: 30000,
		},
	},
	queryOptimizations: [
		{
			issue: "$facet with multiple pipelines scanning same data",
			solution: "Use $unionWith or restructure to single scan when possible",
			impact: "High - reduces collection scans from N to 1",
		},
		{
			issue: "$lookup on same collection (self-join)",
			solution: "Consider denormalization or use $graphLookup for hierarchies",
			impact: "Medium - reduces random I/O",
		},
		{
			issue: "Large result sets with toArray()",
			solution: "Use cursor-based pagination for large datasets",
			impact: "High - prevents memory issues",
		},
	],
	cosmosDbSpecific: {
		description: "Azure Cosmos DB MongoDB API specific settings",
		settings: {
			retryWrites: false, // Not supported in Cosmos DB
			maxIdleTimeMS: 120000, // Prevent connection timeout
		},
		notes: [
			"$median requires Cosmos DB version 4.0+",
			"Some aggregation operators may not be supported",
			"Consider using Cosmos DB's native RU-based throughput settings",
		],
	},
};
