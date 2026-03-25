/**
 * Conversation Lookup Helper
 *
 * Replaces expensive per-row $lookup operations with efficient two-phase queries:
 * 1. Collect unique conversationIds from the source collection
 * 2. Batch-fetch conversation metadata using $in (uses LibreChat's unique index)
 *
 * WHY: MongoDB $lookup without an index triggers a full collection scan for EVERY row.
 * With 100k transactions and 50k conversations, that's 100k * 50k = 5 billion comparisons.
 * This approach does ONE indexed query for N distinct conversationIds instead.
 *
 * LibreChat guarantees a unique index on conversations.conversationId from its schema:
 * `conversationId: { type: String, unique: true, index: true }`
 */

import { Collections, getCollection, QUERY_MAX_TIME_MS } from "../connection";

/** Minimal conversation data needed by the dashboard */
export interface ConversationInfo {
	endpoint: string;
	agent_id?: string;
}

/** Minimal agent data needed by the dashboard */
export interface AgentInfo {
	id: string;
	name: string;
	model: string;
	provider: string;
}

/**
 * Batch-fetch conversation metadata for a set of conversationIds.
 *
 * Returns a Map<conversationId, ConversationInfo> for O(1) lookups.
 * Uses $in query which leverages LibreChat's unique index on conversationId.
 */
export async function getConversationMap(
	conversationIds: string[],
): Promise<Map<string, ConversationInfo>> {
	if (conversationIds.length === 0) return new Map();

	const collection = await getCollection(Collections.CONVERSATIONS);
	const docs = await collection
		.find(
			{ conversationId: { $in: conversationIds } },
			{
				projection: { conversationId: 1, endpoint: 1, agent_id: 1, _id: 0 },
				maxTimeMS: QUERY_MAX_TIME_MS,
			},
		)
		.toArray();

	const map = new Map<string, ConversationInfo>();
	for (const doc of docs) {
		const d = doc as Record<string, unknown>;
		map.set(d.conversationId as string, {
			endpoint: (d.endpoint as string) ?? "direct",
			agent_id: d.agent_id as string | undefined,
		});
	}
	return map;
}

/**
 * Batch-fetch agent metadata for a set of agent IDs.
 *
 * Returns a Map<agentId, AgentInfo> for O(1) lookups.
 * Uses $in query which leverages LibreChat's index on agents.id.
 */
export async function getAgentMap(
	agentIds: string[],
): Promise<Map<string, AgentInfo>> {
	if (agentIds.length === 0) return new Map();

	const collection = await getCollection(Collections.AGENTS);
	const docs = await collection
		.find(
			{ id: { $in: agentIds } },
			{
				projection: { id: 1, name: 1, model: 1, provider: 1, _id: 0 },
				maxTimeMS: QUERY_MAX_TIME_MS,
			},
		)
		.toArray();

	const map = new Map<string, AgentInfo>();
	for (const doc of docs) {
		const d = doc as Record<string, unknown>;
		map.set(d.id as string, {
			id: d.id as string,
			name: d.name as string,
			model: d.model as string,
			provider: d.provider as string,
		});
	}
	return map;
}

/**
 * Get all conversationIds for agent-endpoint conversations.
 *
 * Used by agent-stats queries to flip the query direction:
 * Instead of scanning ALL transactions then filtering to agents,
 * we first find agent conversations, then only query their transactions.
 *
 * LibreChat has an index on conversations.endpoint (or at least the field is commonly queried).
 */
export async function getAgentConversationIds(): Promise<{
	conversationIds: string[];
	agentIdByConversation: Map<string, string>;
}> {
	const collection = await getCollection(Collections.CONVERSATIONS);
	const docs = await collection
		.find(
			{ endpoint: "agents" },
			{
				projection: { conversationId: 1, agent_id: 1, _id: 0 },
				maxTimeMS: QUERY_MAX_TIME_MS,
			},
		)
		.toArray();

	const conversationIds: string[] = [];
	const agentIdByConversation = new Map<string, string>();
	for (const doc of docs) {
		const d = doc as Record<string, unknown>;
		const convId = d.conversationId as string;
		conversationIds.push(convId);
		if (d.agent_id) {
			agentIdByConversation.set(convId, d.agent_id as string);
		}
	}
	return { conversationIds, agentIdByConversation };
}
