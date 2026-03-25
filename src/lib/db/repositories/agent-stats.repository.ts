/**
 * Agent Statistics Repository
 *
 * Handles queries for AI agent usage statistics, tables, and charts.
 *
 * OPTIMIZATION: Flipped query direction compared to original.
 * Instead of: scan ALL transactions -> $lookup conversations -> filter to agents
 * Now: find agent conversations first -> query only their transactions -> join in JS
 *
 * This eliminates both $lookup operations and pre-filters transactions to only
 * agent conversations, reducing the scan by 50-90% depending on agent usage ratio.
 */

import { Collections, getCollection, QUERY_MAX_TIME_MS } from "../connection";
import type {
	DateRange,
	StatsTableEntry,
	TimeGranularity,
	TimeSeriesEntry,
} from "../types";
import { getAgentConversationIds, getAgentMap } from "./conversation-lookup";

/**
 * Date format strings for different granularities
 */
const DATE_FORMATS: Record<TimeGranularity, string> = {
	hour: "%d, %H:00",
	day: "%Y-%m-%d",
	month: "%Y-%m",
};

/**
 * Get total agent count
 */
export async function getTotalAgentCount(): Promise<number> {
	const collection = await getCollection(Collections.AGENTS);
	return collection.countDocuments({}, { maxTimeMS: QUERY_MAX_TIME_MS });
}

/**
 * Get agent statistics for table display
 *
 * Three-phase approach:
 * 1. Find all agent conversations (filtered by endpoint: "agents")
 * 2. Query transactions ONLY for those conversationIds
 * 3. Batch-fetch agent metadata, join in JS
 */
export async function getAgentStatsTable(
	params: DateRange,
): Promise<StatsTableEntry[]> {
	const { startDate, endDate } = params;

	// Phase 1: Get all agent conversation IDs and their agent_id mapping
	const { conversationIds, agentIdByConversation } =
		await getAgentConversationIds();

	if (conversationIds.length === 0) return [];

	// Phase 2: Query transactions ONLY for agent conversations
	const collection = await getCollection(Collections.TRANSACTIONS);
	const preGroupPipeline = [
		{
			$match: {
				createdAt: { $gte: startDate, $lte: endDate },
				conversationId: { $in: conversationIds },
			},
		},
		{
			$group: {
				_id: {
					conversationId: "$conversationId",
					model: "$model",
					tokenType: "$tokenType",
				},
				totalAmount: { $sum: { $abs: "$rawAmount" } },
				count: { $sum: 1 },
			},
		},
	];

	const preGrouped = await collection
		.aggregate<{
			_id: { conversationId: string; model: string; tokenType: string };
			totalAmount: number;
			count: number;
		}>(preGroupPipeline, { maxTimeMS: QUERY_MAX_TIME_MS })
		.toArray();

	if (preGrouped.length === 0) return [];

	// Phase 3: Batch-fetch agent metadata
	const uniqueAgentIds = [...new Set(agentIdByConversation.values())];
	const agentMap = await getAgentMap(uniqueAgentIds);

	// In-memory join
	// Key: agentId -> accumulated stats
	const statsMap = new Map<
		string,
		{
			agentId: string;
			agentName: string;
			model: string;
			endpoint: string;
			totalInputToken: number;
			totalOutputToken: number;
			requests: number;
		}
	>();

	for (const row of preGrouped) {
		const agentId =
			agentIdByConversation.get(row._id.conversationId) ?? "unknown";
		const agent = agentMap.get(agentId);

		const key = agentId;
		let entry = statsMap.get(key);
		if (!entry) {
			entry = {
				agentId,
				agentName: agent?.name ?? agentId,
				model: agent?.model ?? row._id.model,
				endpoint: agent?.provider ?? "agents",
				totalInputToken: 0,
				totalOutputToken: 0,
				requests: 0,
			};
			statsMap.set(key, entry);
		}

		if (row._id.tokenType === "prompt") {
			entry.totalInputToken += row.totalAmount;
		} else if (row._id.tokenType === "completion") {
			entry.totalOutputToken += row.totalAmount;
			entry.requests += row.count;
		}
	}

	return [...statsMap.values()].map((e) => ({
		agentId: e.agentId,
		agentName: e.agentName,
		model: e.model,
		endpoint: e.endpoint,
		totalInputToken: e.totalInputToken,
		totalOutputToken: e.totalOutputToken,
		requests: e.requests,
	}));
}

/**
 * Get agent time series data for charts
 *
 * Three-phase approach:
 * 1. Resolve the agent -> find its conversations
 * 2. Query transactions ONLY for those conversationIds
 * 3. Aggregate in JS with time bucketing already done in pipeline
 */
export async function getAgentTimeSeries(
	params: DateRange & {
		agentName: string;
		granularity: TimeGranularity;
		timezone?: string;
	},
): Promise<TimeSeriesEntry[]> {
	const {
		startDate,
		endDate,
		agentName,
		granularity,
		timezone = "UTC",
	} = params;
	const dateFormat = DATE_FORMATS[granularity];
	const timeField = granularity;

	// Phase 1: Get all agent conversations and resolve the target agent
	const { conversationIds, agentIdByConversation } =
		await getAgentConversationIds();

	if (conversationIds.length === 0) return [];

	// Batch-fetch all agent metadata to find the target agent
	const uniqueAgentIds = [...new Set(agentIdByConversation.values())];
	const agentMap = await getAgentMap(uniqueAgentIds);

	// Find conversations belonging to the requested agent (by name or ID)
	const targetConvIds: string[] = [];
	let resolvedAgentId: string | undefined;
	let resolvedAgentName: string | undefined;
	let resolvedProvider: string | undefined;

	for (const [convId, agentId] of agentIdByConversation) {
		const agent = agentMap.get(agentId);
		if (agent?.name === agentName || agentId === agentName) {
			targetConvIds.push(convId);
			if (!resolvedAgentId) {
				resolvedAgentId = agentId;
				resolvedAgentName = agent?.name ?? agentId;
				resolvedProvider = agent?.provider ?? "agents";
			}
		}
	}

	if (targetConvIds.length === 0) return [];

	// Phase 2: Query transactions ONLY for this agent's conversations
	const collection = await getCollection(Collections.TRANSACTIONS);
	const preGroupPipeline = [
		{
			$match: {
				createdAt: { $gte: startDate, $lte: endDate },
				conversationId: { $in: targetConvIds },
			},
		},
		{
			$group: {
				_id: {
					tokenType: "$tokenType",
					[timeField]: {
						$dateToString: {
							format: dateFormat,
							date: "$createdAt",
							timezone: timezone,
						},
					},
				},
				totalAmount: { $sum: { $abs: "$rawAmount" } },
				count: { $sum: 1 },
			},
		},
	];

	const preGrouped = await collection
		.aggregate<{
			_id: {
				tokenType: string;
				[key: string]: string;
			};
			totalAmount: number;
			count: number;
		}>(preGroupPipeline, { maxTimeMS: QUERY_MAX_TIME_MS })
		.toArray();

	if (preGrouped.length === 0) return [];

	// Phase 3: In-memory aggregation by time bucket
	const timeSeriesMap = new Map<
		string,
		{
			totalInputToken: number;
			totalOutputToken: number;
			requests: number;
		}
	>();

	for (const row of preGrouped) {
		const timeBucket = row._id[timeField];
		let entry = timeSeriesMap.get(timeBucket);
		if (!entry) {
			entry = { totalInputToken: 0, totalOutputToken: 0, requests: 0 };
			timeSeriesMap.set(timeBucket, entry);
		}

		if (row._id.tokenType === "prompt") {
			entry.totalInputToken += row.totalAmount;
		} else if (row._id.tokenType === "completion") {
			entry.totalOutputToken += row.totalAmount;
			entry.requests += row.count;
		}
	}

	// Build result sorted by time bucket
	return [...timeSeriesMap.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([timeBucket, stats]) => ({
			agentId: resolvedAgentId,
			agentName: resolvedAgentName,
			endpoint: resolvedProvider ?? "agents",
			[timeField]: timeBucket,
			totalInputToken: stats.totalInputToken,
			totalOutputToken: stats.totalOutputToken,
			requests: stats.requests,
		}));
}
