/**
 * Cache Token Statistics Repository
 *
 * Queries the `transactions` collection for Anthropic prompt-caching metrics.
 *
 * Schema note: prompt transactions may carry three optional numeric fields:
 *   inputTokens  — regular (non-cached) input tokens
 *   writeTokens  — cache_creation_input_tokens (written to cache)
 *   readTokens   — cache_read_input_tokens (cache hits, discounted)
 *
 * Non-Anthropic models have no cache fields; use $ifNull to default to 0.
 *
 * DocumentDB constraint: $facet is not supported. All multi-period queries
 * run as parallel Promise.all aggregations (same pattern as token-stats.repository.ts).
 */

import type { ObjectId } from "mongodb";
import { Collections, getCollection, QUERY_MAX_TIME_MS } from "../connection";
import type {
	CacheTokenSummaryResult,
	CacheTokenTimeSeriesEntry,
	CacheUsageByModelEntry,
	CacheUsageByUserEntry,
	DateRange,
	PeriodComparison,
	TimeGranularity,
} from "../types";

const DATE_FORMATS: Record<TimeGranularity, string> = {
	hour: "%d, %H:00",
	day: "%Y-%m-%d",
	month: "%Y-%m",
};

/** Shared aggregation stage: sum the three cache fields */
const sumCacheFields = [
	{
		$group: {
			_id: null,
			totalWriteTokens: { $sum: { $ifNull: ["$writeTokens", 0] } },
			totalReadTokens: { $sum: { $ifNull: ["$readTokens", 0] } },
			totalInputTokens: { $sum: { $ifNull: ["$inputTokens", 0] } },
		},
	},
];

/** Base $match for cache-relevant prompt transactions in a date range */
function cacheMatchStage(start: Date, end: Date) {
	return {
		$match: {
			createdAt: { $gte: start, $lte: end },
			tokenType: "prompt",
			$or: [{ writeTokens: { $gt: 0 } }, { readTokens: { $gt: 0 } }],
		},
	};
}

interface CacheSumDoc {
	totalWriteTokens: number;
	totalReadTokens: number;
	totalInputTokens: number;
}

/**
 * Get cache token totals with period comparison.
 */
export async function getCacheTokenSummary(
	params: PeriodComparison,
): Promise<CacheTokenSummaryResult[]> {
	const { startDate, endDate, prevStart, prevEnd } = params;
	const collection = await getCollection(Collections.TRANSACTIONS);

	const [currentResult, prevResult] = await Promise.all([
		collection
			.aggregate<CacheSumDoc>(
				[cacheMatchStage(startDate, endDate), ...sumCacheFields],
				{ maxTimeMS: QUERY_MAX_TIME_MS },
			)
			.toArray(),
		collection
			.aggregate<CacheSumDoc>(
				[cacheMatchStage(prevStart, prevEnd), ...sumCacheFields],
				{ maxTimeMS: QUERY_MAX_TIME_MS },
			)
			.toArray(),
	]);

	const cur = currentResult[0];
	const prev = prevResult[0];

	return [
		{
			currentWriteTokens: cur?.totalWriteTokens ?? 0,
			currentReadTokens: cur?.totalReadTokens ?? 0,
			currentInputTokens: cur?.totalInputTokens ?? 0,
			prevWriteTokens: prev?.totalWriteTokens ?? 0,
			prevReadTokens: prev?.totalReadTokens ?? 0,
			prevInputTokens: prev?.totalInputTokens ?? 0,
		},
	];
}

/**
 * Get daily/hourly/monthly cache token time series.
 */
export async function getCacheTokenTimeSeries(
	params: DateRange & { granularity: TimeGranularity; timezone?: string },
): Promise<CacheTokenTimeSeriesEntry[]> {
	const { startDate, endDate, granularity, timezone = "UTC" } = params;
	const dateFormat = DATE_FORMATS[granularity];
	const timeField = granularity;

	const collection = await getCollection(Collections.TRANSACTIONS);

	const pipeline = [
		cacheMatchStage(startDate, endDate),
		{
			$group: {
				_id: {
					[timeField]: {
						$dateToString: {
							format: dateFormat,
							date: "$createdAt",
							timezone,
						},
					},
				},
				writeTokens: { $sum: { $ifNull: ["$writeTokens", 0] } },
				readTokens: { $sum: { $ifNull: ["$readTokens", 0] } },
				inputTokens: { $sum: { $ifNull: ["$inputTokens", 0] } },
			},
		},
		{ $sort: { [`_id.${timeField}`]: 1 } },
	];

	const rows = await collection
		.aggregate<{
			_id: Record<string, string>;
			writeTokens: number;
			readTokens: number;
			inputTokens: number;
		}>(pipeline, { maxTimeMS: QUERY_MAX_TIME_MS })
		.toArray();

	return rows.map((row) => ({
		[timeField]: row._id[timeField],
		inputTokens: row.inputTokens,
		writeTokens: row.writeTokens,
		readTokens: row.readTokens,
	}));
}

/** Shape returned by the user aggregation */
interface UserCacheAgg {
	_id: ObjectId;
	inputTokens: number;
	writeTokens: number;
	readTokens: number;
}

interface UserDoc {
	_id: ObjectId;
	email?: string;
	name?: string;
}

/**
 * Get cache token usage broken down by user.
 */
export async function getCacheUsageByUser(
	params: DateRange,
): Promise<CacheUsageByUserEntry[]> {
	const { startDate, endDate } = params;
	const collection = await getCollection(Collections.TRANSACTIONS);

	const pipeline = [
		cacheMatchStage(startDate, endDate),
		{
			$group: {
				_id: "$user",
				inputTokens: { $sum: { $ifNull: ["$inputTokens", 0] } },
				writeTokens: { $sum: { $ifNull: ["$writeTokens", 0] } },
				readTokens: { $sum: { $ifNull: ["$readTokens", 0] } },
			},
		},
	];

	const aggregated = await collection
		.aggregate<UserCacheAgg>(pipeline, { maxTimeMS: QUERY_MAX_TIME_MS })
		.toArray();

	if (aggregated.length === 0) return [];

	// Batch-fetch user metadata
	const uniqueUserIds = aggregated.map((r) => r._id).filter(Boolean);
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

	return aggregated
		.map((row) => {
			const user = userMap.get(String(row._id)) ?? {
				email: "unknown@unknown",
				name: "Unknown",
			};
			const total = row.inputTokens + row.writeTokens + row.readTokens;
			const hitRate = total > 0 ? (row.readTokens / total) * 100 : 0;
			return {
				userId: String(row._id),
				email: user.email,
				name: user.name,
				inputTokens: row.inputTokens,
				writeTokens: row.writeTokens,
				readTokens: row.readTokens,
				hitRate: Math.round(hitRate * 10) / 10,
			};
		})
		.sort((a, b) => b.readTokens - a.readTokens);
}

/** Shape returned by the model aggregation */
interface ModelCacheAgg {
	_id: { model: string; endpoint: string };
	inputTokens: number;
	writeTokens: number;
	readTokens: number;
}

/**
 * Get cache token usage broken down by model/endpoint.
 */
export async function getCacheUsageByModel(
	params: DateRange,
): Promise<CacheUsageByModelEntry[]> {
	const { startDate, endDate } = params;
	const collection = await getCollection(Collections.TRANSACTIONS);

	// context field maps to endpoint in LibreChat (e.g. "anthropic")
	const pipeline = [
		cacheMatchStage(startDate, endDate),
		{
			$group: {
				_id: {
					model: { $ifNull: ["$model", "unknown"] },
					endpoint: { $ifNull: ["$context", "unknown"] },
				},
				inputTokens: { $sum: { $ifNull: ["$inputTokens", 0] } },
				writeTokens: { $sum: { $ifNull: ["$writeTokens", 0] } },
				readTokens: { $sum: { $ifNull: ["$readTokens", 0] } },
			},
		},
		{ $sort: { readTokens: -1 } },
	];

	const rows = await collection
		.aggregate<ModelCacheAgg>(pipeline, { maxTimeMS: QUERY_MAX_TIME_MS })
		.toArray();

	return rows.map((row) => {
		const total = row.inputTokens + row.writeTokens + row.readTokens;
		const hitRate = total > 0 ? (row.readTokens / total) * 100 : 0;
		return {
			model: row._id.model,
			endpoint: row._id.endpoint,
			inputTokens: row.inputTokens,
			writeTokens: row.writeTokens,
			readTokens: row.readTokens,
			hitRate: Math.round(hitRate * 10) / 10,
		};
	});
}
