/**
 * Cost Statistics Repository
 *
 * Handles queries for cost metrics grouped by user and email domain.
 *
 * OPTIMIZATION: Uses a two-phase approach instead of $lookup:
 * 1. Aggregate transactions to get cost/token totals grouped by user ObjectId
 * 2. Batch-fetch user metadata (email, name) via indexed $in query on users._id
 * 3. Join in application code
 *
 * Cost calculation:
 * LibreChat stores `tokenValue = rawAmount * rate` where `rate` is in USD per 1M tokens.
 * To convert to actual estimated USD cost: `abs(tokenValue) / 1,000,000`.
 * Costs are then displayed as "Estimated EUR" (treating USD = EUR, no conversion).
 *
 * Token counts come from `rawAmount` (the raw token count per transaction).
 * Both tokenValue and rawAmount are stored as negative for spending, so we always use $abs.
 */

import { type ObjectId } from "mongodb";
import { Collections, getCollection, QUERY_MAX_TIME_MS } from "../connection";
import type { DateRange } from "../types";

/**
 * Cost breakdown per user
 */
export interface CostByUserEntry {
	userId: string;
	email: string;
	name: string;
	domain: string;
	totalCost: number; // actual estimated USD (tokenValue / 1M), treated as EUR
	totalTokens: number; // $abs rawAmount sum
	transactionCount: number;
	costPercentage: number; // % of total cost
}

/**
 * Cost breakdown per email domain
 */
export interface CostByDomainEntry {
	domain: string;
	totalCost: number;
	totalTokens: number;
	transactionCount: number;
	userCount: number;
	costPercentage: number;
}

/** Shape returned by the Phase 1 aggregation pipeline */
interface UserCostAggregation {
	_id: ObjectId; // ObjectId from transactions.user
	totalCost: number;
	totalTokens: number;
	transactionCount: number;
}

/** Shape returned by the Phase 2 user batch-fetch */
interface UserDoc {
	_id: ObjectId;
	email?: string;
	name?: string;
}

/**
 * Get cost statistics grouped by user.
 *
 * Two-phase approach:
 * - Phase 1: Aggregate `transactions` grouped by `user` (ObjectId) within date range.
 *   Sums `$abs("tokenValue")` for cost and `$abs("rawAmount")` for token count.
 * - Phase 2: Batch-fetch user metadata (email, name) from `users` via `$in` on `_id`.
 * - Phase 3: In-memory join, compute per-user cost percentage, return sorted by cost desc.
 */
export async function getCostByUser(
	params: DateRange,
): Promise<CostByUserEntry[]> {
	const { startDate, endDate } = params;
	const transactionsCol = await getCollection(Collections.TRANSACTIONS);

	// Phase 1: Aggregate cost + tokens per user
	const pipeline = [
		{
			$match: {
				createdAt: { $gte: startDate, $lte: endDate },
			},
		},
		{
			$group: {
				_id: "$user",
				totalCost: { $sum: { $abs: "$tokenValue" } },
				totalTokens: { $sum: { $abs: "$rawAmount" } },
				transactionCount: { $sum: 1 },
			},
		},
		{
			$sort: { totalCost: -1 as const },
		},
	];

	const aggregated = await transactionsCol
		.aggregate<UserCostAggregation>(pipeline, {
			maxTimeMS: QUERY_MAX_TIME_MS,
		})
		.toArray();

	if (aggregated.length === 0) return [];

	// Phase 2: Batch-fetch user metadata
	const userIds = aggregated.map((r) => r._id);
	const usersCol = await getCollection(Collections.USERS);
	const userDocs = await usersCol
		.find(
			{ _id: { $in: userIds } },
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
			email: (d.email as string) ?? "unknown@unknown",
			name: (d.name as string) ?? "Unknown",
		});
	}

	// Phase 3: In-memory join
	// Convert tokenValue sum to actual USD: tokenValue is (rawAmount * rate)
	// where rate is USD per 1M tokens, so divide by 1,000,000 to get real cost.
	const TOKEN_VALUE_DIVISOR = 1_000_000;
	const grandTotal =
		aggregated.reduce((sum, r) => sum + r.totalCost, 0) / TOKEN_VALUE_DIVISOR;

	const result: CostByUserEntry[] = aggregated.map((row) => {
		const uid = String(row._id);
		const user = userMap.get(uid) ?? {
			email: "unknown@unknown",
			name: "Unknown",
		};
		const domain = user.email.includes("@")
			? user.email.split("@")[1]
			: "unknown";

		const costUsd = row.totalCost / TOKEN_VALUE_DIVISOR;

		return {
			userId: uid,
			email: user.email,
			name: user.name,
			domain,
			totalCost: costUsd,
			totalTokens: row.totalTokens,
			transactionCount: row.transactionCount,
			costPercentage: grandTotal > 0 ? (costUsd / grandTotal) * 100 : 0,
		};
	});

	return result;
}

/**
 * Get cost statistics grouped by email domain.
 *
 * Reuses the per-user cost data from {@link getCostByUser} and re-aggregates
 * in JavaScript by the domain portion of each user's email address.
 *
 * Returns domains sorted by total cost descending, with each domain's share
 * of overall cost as `costPercentage`.
 */
export async function getCostByDomain(
	params: DateRange,
): Promise<CostByDomainEntry[]> {
	const userCosts = await getCostByUser(params);

	if (userCosts.length === 0) return [];

	// Re-aggregate by domain
	const domainMap = new Map<
		string,
		{
			totalCost: number;
			totalTokens: number;
			transactionCount: number;
			users: Set<string>;
		}
	>();

	for (const entry of userCosts) {
		let agg = domainMap.get(entry.domain);
		if (!agg) {
			agg = {
				totalCost: 0,
				totalTokens: 0,
				transactionCount: 0,
				users: new Set(),
			};
			domainMap.set(entry.domain, agg);
		}
		agg.totalCost += entry.totalCost;
		agg.totalTokens += entry.totalTokens;
		agg.transactionCount += entry.transactionCount;
		agg.users.add(entry.userId);
	}

	const grandTotal = userCosts.reduce((sum, e) => sum + e.totalCost, 0);

	const result: CostByDomainEntry[] = [...domainMap.entries()]
		.map(([domain, agg]) => ({
			domain,
			totalCost: agg.totalCost,
			totalTokens: agg.totalTokens,
			transactionCount: agg.transactionCount,
			userCount: agg.users.size,
			costPercentage: grandTotal > 0 ? (agg.totalCost / grandTotal) * 100 : 0,
		}))
		.sort((a, b) => b.totalCost - a.totalCost);

	return result;
}
