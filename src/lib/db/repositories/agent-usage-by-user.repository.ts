/**
 * Agent Usage By User Repository
 *
 * Provides per-user breakdowns of agent usage.
 *
 * APPROACH: Start from date-filtered transactions → look up which conversations are agent
 * conversations → aggregate tokens per user+agent. Avoids fetching all agent conversations
 * ever (which caused timeout with large datasets).
 */

import { ObjectId } from "mongodb";
import { Collections, getCollection, QUERY_MAX_TIME_MS } from "../connection";
import type {
	AgentUsageByUserEntry,
	DateRange,
	TimeGranularity,
	TimeSeriesEntry,
} from "../types";
import { getAgentMap } from "./conversation-lookup";

/** Shape returned by Phase 2 aggregation */
interface UserConvAggregation {
	_id: {
		user: ObjectId;
		conversationId: string;
		tokenType: string;
	};
	totalAmount: number;
	count: number;
}

/** Shape of user docs from the users collection */
interface UserDoc {
	_id: ObjectId;
	email?: string;
	name?: string;
}

const DATE_FORMATS: Record<TimeGranularity, string> = {
	hour: "%d, %H:00",
	day: "%Y-%m-%d",
	month: "%Y-%m",
};

/**
 * Get agent usage statistics broken down by user.
 *
 * Returns one entry per unique user+agent combination within the date range.
 *
 * QUERY STRATEGY: Start from date-filtered transactions to avoid fetching all
 * agent conversations ever (which creates a huge $in array and causes timeouts).
 *
 * Phase 1: Distinct conversationIds from transactions in date range
 * Phase 2: Fetch those conversations filtered to endpoint="agents" → agentId map
 * Phase 3: Aggregate transactions filtered to agent conversationIds in date range
 * Phase 4: Batch-fetch agent + user metadata, in-memory join
 */
export async function getAgentUsageByUser(
	params: DateRange,
): Promise<AgentUsageByUserEntry[]> {
	const { startDate, endDate } = params;

	const transactionsCol = await getCollection(Collections.TRANSACTIONS);

	// Phase 1: Get distinct conversationIds from transactions in date range
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

	// Phase 3: Aggregate transactions grouped by {user, conversationId, tokenType}
	const pipeline = [
		{
			$match: {
				createdAt: { $gte: startDate, $lte: endDate },
				conversationId: { $in: agentConversationIds },
			},
		},
		{
			$group: {
				_id: {
					user: "$user",
					conversationId: "$conversationId",
					tokenType: "$tokenType",
				},
				totalAmount: { $sum: { $abs: "$rawAmount" } },
				count: { $sum: 1 },
			},
		},
	];

	const aggregated = await transactionsCol
		.aggregate<UserConvAggregation>(pipeline, { maxTimeMS: QUERY_MAX_TIME_MS })
		.toArray();

	if (aggregated.length === 0) return [];

	// Phase 4a: Batch-fetch agent metadata
	const uniqueAgentIds = [...new Set(agentIdByConversation.values())];
	const agentMap = await getAgentMap(uniqueAgentIds);

	// Phase 4b: Batch-fetch user metadata
	const uniqueUserIds = [
		...new Set(aggregated.map((r) => r._id.user).filter(Boolean)),
	];
	const usersCol = await getCollection(Collections.USERS);
	const userDocs = await usersCol
		.find(
			{ _id: { $in: uniqueUserIds } },
			{
				projection: { _id: 1, email: 1, name: 1 },
				maxTimeMS: QUERY_MAX_TIME_MS,
			},
		)
		.toArray();

	const userMap = new Map<string, { email: string; name: string }>();
	for (const doc of userDocs) {
		const d = doc as unknown as UserDoc;
		userMap.set(String(d._id), {
			email: d.email ?? "unknown@unknown",
			name: d.name ?? "Unknown",
		});
	}

	// Phase 5: In-memory join — group by {userId, agentId}
	const statsMap = new Map<
		string,
		{
			userId: string;
			email: string;
			name: string;
			agentId: string;
			agentName: string;
			totalInputToken: number;
			totalOutputToken: number;
			requests: number;
		}
	>();

	for (const row of aggregated) {
		const userId = String(row._id.user);
		const agentId =
			agentIdByConversation.get(row._id.conversationId) ?? "unknown";
		const agent = agentMap.get(agentId);
		const user = userMap.get(userId) ?? {
			email: "unknown@unknown",
			name: "Unknown",
		};

		const key = `${userId}::${agentId}`;
		let entry = statsMap.get(key);
		if (!entry) {
			entry = {
				userId,
				email: user.email,
				name: user.name,
				agentId,
				agentName: agent?.name ?? agentId,
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

	return [...statsMap.values()].sort((a, b) => b.requests - a.requests);
}

/**
 * Get time series data for a specific user+agent combination.
 *
 * Used by the inline chart when expanding a row in the agent-usage-by-user table.
 */
export async function getAgentUsageByUserTimeSeries(
	params: DateRange & {
		userId: string;
		agentId: string;
		granularity: TimeGranularity;
		timezone?: string;
	},
): Promise<TimeSeriesEntry[]> {
	const {
		startDate,
		endDate,
		userId,
		agentId,
		granularity,
		timezone = "UTC",
	} = params;
	const dateFormat = DATE_FORMATS[granularity];
	const timeField = granularity;

	// Phase 1: Get distinct conversationIds for this user in the date range
	const transactionsCol = await getCollection(Collections.TRANSACTIONS);

	let userObjectId: ObjectId;
	try {
		userObjectId = new ObjectId(userId);
	} catch {
		return [];
	}

	const distinctConvIds = await transactionsCol
		.distinct("conversationId", {
			createdAt: { $gte: startDate, $lte: endDate },
			user: userObjectId,
		})
		.then((ids) => ids.filter(Boolean) as string[]);

	if (distinctConvIds.length === 0) return [];

	// Phase 2: Fetch conversations for this user in the date range that belong to the target agent
	const conversationsCol = await getCollection(Collections.CONVERSATIONS);
	const agentConvDocs = await conversationsCol
		.find(
			{
				conversationId: { $in: distinctConvIds },
				endpoint: "agents",
				agent_id: agentId,
			},
			{
				projection: { conversationId: 1, _id: 0 },
				maxTimeMS: QUERY_MAX_TIME_MS,
			},
		)
		.toArray();

	if (agentConvDocs.length === 0) return [];

	const targetConvIds = agentConvDocs.map(
		(d) => (d as Record<string, unknown>).conversationId as string,
	);

	// Phase 3: Query transactions for this user + agent's conversations
	const pipeline = [
		{
			$match: {
				createdAt: { $gte: startDate, $lte: endDate },
				user: userObjectId,
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
							timezone,
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
			_id: { tokenType: string; [key: string]: string };
			totalAmount: number;
			count: number;
		}>(pipeline, { maxTimeMS: QUERY_MAX_TIME_MS })
		.toArray();

	if (preGrouped.length === 0) return [];

	// Phase 4: In-memory aggregation by time bucket
	const timeSeriesMap = new Map<
		string,
		{ totalInputToken: number; totalOutputToken: number; requests: number }
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

	return [...timeSeriesMap.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([timeBucket, stats]) => ({
			agentId,
			endpoint: "agents",
			[timeField]: timeBucket,
			totalInputToken: stats.totalInputToken,
			totalOutputToken: stats.totalOutputToken,
			requests: stats.requests,
		}));
}
