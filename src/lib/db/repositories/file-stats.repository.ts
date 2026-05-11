import { Collections, getCollection, QUERY_MAX_TIME_MS } from "../connection";
import type { PeriodComparison, TokenCountResult } from "../types";

/**
 * Get files processed count with period comparison
 */
export async function getFilesProcessedStats(
	params: PeriodComparison,
): Promise<TokenCountResult[]> {
	const { startDate, endDate, prevStart, prevEnd } = params;
	const collection = await getCollection(Collections.FILES);

	// DocumentDB does not support $facet — run two parallel aggregations instead
	const [currentResult, prevResult] = await Promise.all([
		collection
			.aggregate<{ total: number }>(
				[{ $match: { createdAt: { $gte: startDate, $lte: endDate } } }, { $count: "total" }],
				{ maxTimeMS: QUERY_MAX_TIME_MS },
			)
			.toArray(),
		collection
			.aggregate<{ total: number }>(
				[{ $match: { createdAt: { $gte: prevStart, $lte: prevEnd } } }, { $count: "total" }],
				{ maxTimeMS: QUERY_MAX_TIME_MS },
			)
			.toArray(),
	]);

	const current = currentResult[0]?.total ?? 0;
	const prev = prevResult[0]?.total ?? 0;

	// Map to TokenCountResult structure to reuse existing types/components if possible,
	// or just return simple object. Here we return a structure similar to other stats.
	return [
		{
			currentInputToken: current, // abusing this field for "current count"
			prevInputToken: prev, // abusing this field for "prev count"
			currentOutputToken: 0,
			prevOutputToken: 0,
		},
	];
}
