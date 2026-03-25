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

	const pipeline = [
		{
			$facet: {
				current: [
					{ $match: { createdAt: { $gte: startDate, $lte: endDate } } },
					{ $group: { _id: "$user" } },
					{ $count: "activeUserCount" },
				],
				prev: [
					{ $match: { createdAt: { $gte: prevStart, $lte: prevEnd } } },
					{ $group: { _id: "$user" } },
					{ $count: "activeUserCount" },
				],
			},
		},
		{
			$project: {
				currentActiveUsers: {
					$ifNull: [{ $arrayElemAt: ["$current.activeUserCount", 0] }, 0],
				},
				prevActiveUsers: {
					$ifNull: [{ $arrayElemAt: ["$prev.activeUserCount", 0] }, 0],
				},
			},
		},
	];

	return collection
		.aggregate<ActiveUsersResult>(pipeline, { maxTimeMS: QUERY_MAX_TIME_MS })
		.toArray();
}

/**
 * Get count of unique conversations in a date range with period comparison
 */
export async function getConversations(
	params: PeriodComparison,
): Promise<ConversationsResult[]> {
	const { startDate, endDate, prevStart, prevEnd } = params;
	const collection = await getCollection(Collections.MESSAGES);

	const pipeline = [
		{
			$facet: {
				current: [
					{ $match: { createdAt: { $gte: startDate, $lte: endDate } } },
					{ $group: { _id: "$conversationId" } },
					{ $count: "conversationCount" },
				],
				prev: [
					{ $match: { createdAt: { $gte: prevStart, $lte: prevEnd } } },
					{ $group: { _id: "$conversationId" } },
					{ $count: "conversationCount" },
				],
			},
		},
		{
			$project: {
				currentConversations: {
					$ifNull: [{ $arrayElemAt: ["$current.conversationCount", 0] }, 0],
				},
				prevConversations: {
					$ifNull: [{ $arrayElemAt: ["$prev.conversationCount", 0] }, 0],
				},
			},
		},
	];

	return collection
		.aggregate<ConversationsResult>(pipeline, { maxTimeMS: QUERY_MAX_TIME_MS })
		.toArray();
}

/**
 * Get total user count from users collection
 */
export async function getTotalUserCount(): Promise<number> {
	const collection = await getCollection(Collections.USERS);
	return collection.countDocuments({}, { maxTimeMS: QUERY_MAX_TIME_MS });
}
