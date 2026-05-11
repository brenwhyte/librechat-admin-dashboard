/**
 * User Statistics Repository
 *
 * Handles queries related to user counts and activity metrics.
 */

import { Collections, getCollection, QUERY_MAX_TIME_MS } from "../connection";
import type {
	ActiveUsersResult,
	ConversationsResult,
	PeriodComparison,
} from "../types";

/**
 * Get count of unique active users in a date range with period comparison
 */
export async function getActiveUsers(
	params: PeriodComparison,
): Promise<ActiveUsersResult[]> {
	const { startDate, endDate, prevStart, prevEnd } = params;
	const collection = await getCollection(Collections.MESSAGES);

	// DocumentDB does not support $facet — run two parallel aggregations instead
	const [currentResult, prevResult] = await Promise.all([
		collection
			.aggregate<{ activeUserCount: number }>(
				[
					{ $match: { createdAt: { $gte: startDate, $lte: endDate } } },
					{ $group: { _id: "$user" } },
					{ $count: "activeUserCount" },
				],
				{ maxTimeMS: QUERY_MAX_TIME_MS },
			)
			.toArray(),
		collection
			.aggregate<{ activeUserCount: number }>(
				[
					{ $match: { createdAt: { $gte: prevStart, $lte: prevEnd } } },
					{ $group: { _id: "$user" } },
					{ $count: "activeUserCount" },
				],
				{ maxTimeMS: QUERY_MAX_TIME_MS },
			)
			.toArray(),
	]);

	return [
		{
			currentActiveUsers: currentResult[0]?.activeUserCount ?? 0,
			prevActiveUsers: prevResult[0]?.activeUserCount ?? 0,
		},
	];
}

/**
 * Get count of unique conversations in a date range with period comparison
 */
export async function getConversations(
	params: PeriodComparison,
): Promise<ConversationsResult[]> {
	const { startDate, endDate, prevStart, prevEnd } = params;
	const collection = await getCollection(Collections.MESSAGES);

	// DocumentDB does not support $facet — run two parallel aggregations instead
	const [currentResult, prevResult] = await Promise.all([
		collection
			.aggregate<{ conversationCount: number }>(
				[
					{ $match: { createdAt: { $gte: startDate, $lte: endDate } } },
					{ $group: { _id: "$conversationId" } },
					{ $count: "conversationCount" },
				],
				{ maxTimeMS: QUERY_MAX_TIME_MS },
			)
			.toArray(),
		collection
			.aggregate<{ conversationCount: number }>(
				[
					{ $match: { createdAt: { $gte: prevStart, $lte: prevEnd } } },
					{ $group: { _id: "$conversationId" } },
					{ $count: "conversationCount" },
				],
				{ maxTimeMS: QUERY_MAX_TIME_MS },
			)
			.toArray(),
	]);

	return [
		{
			currentConversations: currentResult[0]?.conversationCount ?? 0,
			prevConversations: prevResult[0]?.conversationCount ?? 0,
		},
	];
}

/**
 * Get total user count from users collection
 */
export async function getTotalUserCount(): Promise<number> {
	const collection = await getCollection(Collections.USERS);
	return collection.countDocuments({}, { maxTimeMS: QUERY_MAX_TIME_MS });
}
