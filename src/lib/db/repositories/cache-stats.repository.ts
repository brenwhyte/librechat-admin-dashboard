/**
 * Cache Token Statistics Repository
 *
 * Queries the `transactions` collection for Anthropic prompt-caching metrics.
 *
 * Schema note: prompt transactions carry three optional numeric fields,
 * stored as NEGATIVE values (same sign convention as rawAmount):
 *   inputTokens  — regular (non-cached) input tokens  (e.g. -11187)
 *   writeTokens  — cache_creation_input_tokens          (0 for OpenAI auto-cache; negative for Anthropic direct API)
 *   readTokens   — cache_read_input_tokens (cache hits) (e.g. -43520)
 *
 * OpenAI models (gpt-5.x): readTokens is negative when cached; writeTokens is always 0.
 * Anthropic via Bedrock: fields absent entirely (Bedrock path doesn't populate them).
 * Anthropic direct API:  all three fields populated as negative values.
 *
 * Filter: use $lt: 0 (not $gt: 0) to detect non-zero cache usage.
 * Sums:   wrap with $abs to return positive token counts.
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

/** Shared aggregation stage: sum the three cache fields (abs — values are stored negative) */
const sumCacheFields = [
	{
		$group: {
			_id: null,
			totalWriteTokens: { $sum: { $abs: { $ifNull: ["$writeTokens", 0] } } },
			totalReadTokens: { $sum: { $abs: { $ifNull: ["$readTokens", 0] } } },
			totalInputTokens: { $sum: { $abs: { $ifNull: ["$inputTokens", 0] } } },
		},
	},
];

/** Base $match for cache-relevant prompt transactions in a date range.
 * Values are stored as negative — use $lt: 0 to detect non-zero cache usage. */
function cacheMatchStage(start: Date, end: Date) {
	return {
		$match: {
			createdAt: { $gte: start, $lte: end },
			tokenType: "prompt",
			$or: [{ writeTokens: { $lt: 0 } }, { readTokens: { $lt: 0 } }],
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
				writeTokens: { $sum: { $abs: { $ifNull: ["$writeTokens", 0] } } },
				readTokens: { $sum: { $abs: { $ifNull: ["$readTokens", 0] } } },
				inputTokens: { $sum: { $abs: { $ifNull: ["$inputTokens", 0] } } },
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
				inputTokens: { $sum: { $abs: { $ifNull: ["$inputTokens", 0] } } },
				writeTokens: { $sum: { $abs: { $ifNull: ["$writeTokens", 0] } } },
				readTokens: { $sum: { $abs: { $ifNull: ["$readTokens", 0] } } },
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
				inputTokens: { $sum: { $abs: { $ifNull: ["$inputTokens", 0] } } },
				writeTokens: { $sum: { $abs: { $ifNull: ["$writeTokens", 0] } } },
				readTokens: { $sum: { $abs: { $ifNull: ["$readTokens", 0] } } },
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
