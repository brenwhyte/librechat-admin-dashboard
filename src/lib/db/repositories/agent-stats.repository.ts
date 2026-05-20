/**
 * Agent Statistics Repository
 *
 * Handles queries for AI agent usage statistics, tables, and charts.
 *
 * OPTIMIZATION: Start from date-filtered transactions to avoid fetching all agent
 * conversations ever (which creates a huge $in array and causes timeouts on large instances).
 * Pattern: distinct conversationIds from transactions → fetch those conversations filtered
 * to endpoint=agents → aggregate only agent transactions in the date range.
 */

import { Collections, getCollection, QUERY_MAX_TIME_MS } from "../connection";
import type {
	DateRange,
	StatsTableEntry,
	TimeGranularity,
	TimeSeriesEntry,
} from "../types";
import { getAgentMap } from "./conversation-lookup";

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
 * Get agent statistics for table display.
 *
 * Query strategy: start from date-filtered transactions → look up which
 * conversations are agent conversations → aggregate per agent.
 */
export async function getAgentStatsTable(
	params: DateRange,
): Promise<StatsTableEntry[]> {
	const { startDate, endDate } = params;

	// Phase 1: Distinct conversationIds from transactions in date range
	const transactionsCol = await getCollection(Collections.TRANSACTIONS);
	const distinctConvIds = await transactionsCol
		.distinct("conversationId", {
			createdAt: { $gte: startDate, $lte: endDate },
		})
		.then((ids) => ids.filter(Boolean) as string[]);

	if (distinctConvIds.length === 0) return [];

	// Phase 2: Fetch only those conversations that are agent conversations
	const conversationsCol = await getCollection(Collections.CONVERSATIONS);
	const agentConvDocs = await conversationsCol
		.find(
			{ conversationId: { $in: distinctConvIds }, endpoint: "agents" },
			{
				projection: { conversationId: 1, agent_id: 1, _id: 0 },
				maxTimeMS: QUERY_MAX_TIME_MS,
			},
		)
		.toArray();

	if (agentConvDocs.length === 0) return [];

	const agentConversationIds: string[] = [];
	const agentIdByConversation = new Map<string, string>();
	for (const doc of agentConvDocs) {
		const d = doc as Record<string, unknown>;
		const convId = d.conversationId as string;
		agentConversationIds.push(convId);
		if (d.agent_id) {
			agentIdByConversation.set(convId, d.agent_id as string);
		}
	}

	// Phase 3: Aggregate transactions for agent conversations only
	const preGroupPipeline = [
		{
			$match: {
				createdAt: { $gte: startDate, $lte: endDate },
				conversationId: { $in: agentConversationIds },
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

	const preGrouped = await transactionsCol
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
 * Get agent time series data for charts.
 *
 * Query strategy: look up the agent by name in the agents collection first
 * (targeted query, no full-scan) → get the agent_id → find conversations for
 * that agent from date-filtered transaction conversationIds → aggregate tokens.
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

	// Phase 1: Look up the agent by name (or id) in the agents collection
	const agentsCol = await getCollection(Collections.AGENTS);
	const agentDoc = await agentsCol.findOne(
		{ $or: [{ name: agentName }, { id: agentName }] },
		{
			projection: { id: 1, name: 1, provider: 1, _id: 0 },
			maxTimeMS: QUERY_MAX_TIME_MS,
		},
	);

	if (!agentDoc) return [];
	const d = agentDoc as Record<string, unknown>;
	const resolvedAgentId = d.id as string;
	const resolvedAgentName = d.name as string;
	const resolvedProvider = (d.provider as string | undefined) ?? "agents";

	// Phase 2: Distinct conversationIds from transactions in date range
	const transactionsCol = await getCollection(Collections.TRANSACTIONS);
	const distinctConvIds = await transactionsCol
		.distinct("conversationId", {
			createdAt: { $gte: startDate, $lte: endDate },
		})
		.then((ids) => ids.filter(Boolean) as string[]);

	if (distinctConvIds.length === 0) return [];

	// Phase 3: Find conversations that belong to this specific agent
	const conversationsCol = await getCollection(Collections.CONVERSATIONS);
	const agentConvDocs = await conversationsCol
		.find(
			{
				conversationId: { $in: distinctConvIds },
				endpoint: "agents",
				agent_id: resolvedAgentId,
			},
			{
				projection: { conversationId: 1, _id: 0 },
				maxTimeMS: QUERY_MAX_TIME_MS,
			},
		)
		.toArray();

	if (agentConvDocs.length === 0) return [];

	const targetConvIds = agentConvDocs.map(
		(doc) => (doc as Record<string, unknown>).conversationId as string,
	);

	// Phase 4: Aggregate transactions for this agent's conversations
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

	const preGrouped = await transactionsCol
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

	// Phase 5: In-memory aggregation by time bucket
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
