/**
 * Model Statistics Repository
 *
 * Handles queries for model usage statistics, tables, and charts.
 *
 * OPTIMIZATION: All queries use a two-phase approach instead of $lookup:
 * 1. Aggregate transactions to get pre-grouped data + unique conversationIds
 * 2. Batch-fetch conversations/agents via indexed $in queries
 * 3. Join in application code
 *
 * This avoids per-row $lookup which triggers full collection scans without indexes.
 */

import { Collections, getCollection, QUERY_MAX_TIME_MS } from "../connection";
import type {
	DateRange,
	ModelUsageEntry,
	StatsTableEntry,
	TimeGranularity,
	TimeSeriesEntry,
} from "../types";
import { getAgentMap, getConversationMap } from "./conversation-lookup";

/**
 * Date format strings for different granularities
 */
const DATE_FORMATS: Record<TimeGranularity, string> = {
	hour: "%d, %H:00",
	day: "%Y-%m-%d",
	month: "%Y-%m",
};

/**
 * Get all available models and agents with their first usage date
 */
export async function getModelsAndAgents() {
	const collection = await getCollection(Collections.MESSAGES);

	const pipeline = [
		{ $match: { model: { $ne: null } } },
		{
			$group: {
				_id: { endpoint: "$endpoint", model: "$model" },
				sender: { $addToSet: "$sender" },
				firstCreatedAt: { $min: "$createdAt" },
			},
		},
		{ $sort: { firstCreatedAt: 1 } },
		{
			$group: {
				_id: "$_id.endpoint",
				models: {
					$push: {
						$mergeObjects: [
							{ model: "$_id.model", firstCreatedAt: "$firstCreatedAt" },
							{
								$cond: [
									{ $eq: ["$_id.endpoint", "agents"] },
									{ agentName: "$sender" },
									{},
								],
							},
						],
					},
				},
			},
		},
	];

	return collection
		.aggregate(pipeline, { maxTimeMS: QUERY_MAX_TIME_MS })
		.toArray();
}

/**
 * Get model usage statistics grouped by provider/endpoint
 *
 * Two-phase approach:
 * Phase 1: Aggregate transactions grouped by conversationId + model (reduces 100k rows to ~5k)
 * Phase 2: Batch-fetch conversations + agents, then resolve endpoint/model in JS
 */
export async function getModelUsageByProvider(
	params: DateRange,
): Promise<ModelUsageEntry[]> {
	const { startDate, endDate } = params;
	const collection = await getCollection(Collections.TRANSACTIONS);

	// Phase 1: Pre-group transactions by conversationId + model to reduce row count
	const preGroupPipeline = [
		{
			$match: {
				createdAt: { $gte: startDate, $lte: endDate },
				model: { $ne: null },
			},
		},
		{
			$group: {
				_id: { conversationId: "$conversationId", model: "$model" },
				tokenCount: { $sum: { $abs: "$rawAmount" } },
			},
		},
	];

	const preGrouped = await collection
		.aggregate<{
			_id: { conversationId: string; model: string };
			tokenCount: number;
		}>(preGroupPipeline, { maxTimeMS: QUERY_MAX_TIME_MS })
		.toArray();

	if (preGrouped.length === 0) return [];

	// Phase 2: Batch-fetch conversation + agent metadata
	const uniqueConvIds = [
		...new Set(preGrouped.map((r) => r._id.conversationId)),
	];
	const convMap = await getConversationMap(uniqueConvIds);

	// Collect agent_ids from agent conversations
	const agentIds = new Set<string>();
	for (const conv of convMap.values()) {
		if (conv.endpoint === "agents" && conv.agent_id) {
			agentIds.add(conv.agent_id);
		}
	}
	const agentMap = await getAgentMap([...agentIds]);

	// Phase 3: In-memory join — resolve endpoint and model
	const endpointModelTokens = new Map<string, Map<string, number>>();

	for (const row of preGrouped) {
		const conv = convMap.get(row._id.conversationId);
		const endpoint = conv?.endpoint ?? "direct";

		// Resolve the model: for agents, use agent.model; otherwise use transaction.model
		let resolvedModel = row._id.model;
		if (conv?.endpoint === "agents" && conv.agent_id) {
			const agent = agentMap.get(conv.agent_id);
			if (agent?.model) {
				resolvedModel = agent.model;
			}
		}

		if (!endpointModelTokens.has(endpoint)) {
			endpointModelTokens.set(endpoint, new Map());
		}
		const modelMap = endpointModelTokens.get(endpoint)!;
		modelMap.set(
			resolvedModel,
			(modelMap.get(resolvedModel) ?? 0) + row.tokenCount,
		);
	}

	// Build result in the expected format
	const result: ModelUsageEntry[] = [];
	for (const [endpoint, modelMap] of endpointModelTokens) {
		let totalTokenCount = 0;
		const models: Array<{ name: string; tokenCount: number }> = [];
		for (const [name, tokenCount] of modelMap) {
			totalTokenCount += tokenCount;
			models.push({ name, tokenCount });
		}
		result.push({
			_id: endpoint,
			totalTokenCount,
			models,
		});
	}

	result.sort((a, b) => a._id.localeCompare(b._id));
	return result;
}

/**
 * Get model statistics for table display (non-agent endpoints)
 *
 * Two-phase approach: pre-group by conversationId/model/tokenType, then batch-fetch metadata.
 */
export async function getModelStatsTable(
	params: DateRange,
): Promise<StatsTableEntry[]> {
	const { startDate, endDate } = params;
	const collection = await getCollection(Collections.TRANSACTIONS);

	// Phase 1: Pre-group transactions
	const preGroupPipeline = [
		{
			$match: {
				createdAt: { $gte: startDate, $lte: endDate },
				model: { $ne: null },
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

	// Phase 2: Batch-fetch metadata
	const uniqueConvIds = [
		...new Set(preGrouped.map((r) => r._id.conversationId)),
	];
	const convMap = await getConversationMap(uniqueConvIds);

	const agentIds = new Set<string>();
	for (const conv of convMap.values()) {
		if (conv.endpoint === "agents" && conv.agent_id) {
			agentIds.add(conv.agent_id);
		}
	}
	const agentMap = await getAgentMap([...agentIds]);

	// Phase 3: In-memory join
	// Key: "model|endpoint" -> accumulated stats
	const statsMap = new Map<
		string,
		{
			model: string;
			endpoint: string;
			totalInputToken: number;
			totalOutputToken: number;
			requests: number;
		}
	>();

	for (const row of preGrouped) {
		const conv = convMap.get(row._id.conversationId);
		const endpoint = conv?.endpoint ?? "direct";

		let resolvedModel = row._id.model;
		if (conv?.endpoint === "agents" && conv.agent_id) {
			const agent = agentMap.get(conv.agent_id);
			if (agent?.model) {
				resolvedModel = agent.model;
			}
		}

		const key = `${resolvedModel}|${endpoint}`;
		let entry = statsMap.get(key);
		if (!entry) {
			entry = {
				model: resolvedModel,
				endpoint,
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

	return [...statsMap.values()];
}

/**
 * Get model time series data for charts
 *
 * Two-phase approach: aggregate transactions for a specific model, then batch-fetch
 * conversation endpoints. Only needs endpoint (no agent resolution).
 */
export async function getModelTimeSeries(
	params: DateRange & {
		model: string;
		granularity: TimeGranularity;
		timezone?: string;
	},
): Promise<TimeSeriesEntry[]> {
	const { startDate, endDate, model, granularity, timezone = "UTC" } = params;
	const collection = await getCollection(Collections.TRANSACTIONS);
	const dateFormat = DATE_FORMATS[granularity];
	const timeField = granularity;

	// Phase 1: Aggregate transactions grouped by conversationId + time bucket
	const preGroupPipeline = [
		{
			$match: {
				createdAt: { $gte: startDate, $lte: endDate },
				model: model,
			},
		},
		{
			$group: {
				_id: {
					conversationId: "$conversationId",
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
				conversationId: string;
				tokenType: string;
				[key: string]: string;
			};
			totalAmount: number;
			count: number;
		}>(preGroupPipeline, { maxTimeMS: QUERY_MAX_TIME_MS })
		.toArray();

	if (preGrouped.length === 0) return [];

	// Phase 2: Batch-fetch conversation endpoints
	const uniqueConvIds = [
		...new Set(preGrouped.map((r) => r._id.conversationId)),
	];
	const convMap = await getConversationMap(uniqueConvIds);

	// Phase 3: In-memory join
	// Key: "model|endpoint|timeBucket"
	const timeSeriesMap = new Map<
		string,
		{
			model: string;
			endpoint: string;
			timeBucket: string;
			totalInputToken: number;
			totalOutputToken: number;
			requests: number;
		}
	>();

	for (const row of preGrouped) {
		const conv = convMap.get(row._id.conversationId);
		const endpoint = conv?.endpoint ?? "direct";
		const timeBucket = row._id[timeField];

		const key = `${model}|${endpoint}|${timeBucket}`;
		let entry = timeSeriesMap.get(key);
		if (!entry) {
			entry = {
				model,
				endpoint,
				timeBucket,
				totalInputToken: 0,
				totalOutputToken: 0,
				requests: 0,
			};
			timeSeriesMap.set(key, entry);
		}

		if (row._id.tokenType === "prompt") {
			entry.totalInputToken += row.totalAmount;
		} else if (row._id.tokenType === "completion") {
			entry.totalOutputToken += row.totalAmount;
			entry.requests += row.count;
		}
	}

	// Build result sorted by time bucket
	const result: TimeSeriesEntry[] = [...timeSeriesMap.values()]
		.map((e) => ({
			model: e.model,
			endpoint: e.endpoint,
			[timeField]: e.timeBucket,
			totalInputToken: e.totalInputToken,
			totalOutputToken: e.totalOutputToken,
			requests: e.requests,
		}))
		.sort((a, b) => {
			const aTime = (a as Record<string, unknown>)[timeField] as string;
			const bTime = (b as Record<string, unknown>)[timeField] as string;
			return aTime.localeCompare(bTime);
		});

	return result;
}
