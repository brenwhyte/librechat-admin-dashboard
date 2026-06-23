import { NextResponse } from "next/server";
import { buildCacheKey, withCache } from "@/lib/api/cache";
import {
	getDateParamsFromUrl,
	validateDateRange,
} from "@/lib/api/date-validation";
import { getCacheTokenTimeSeries } from "@/lib/db/repositories";

export async function GET(request: Request) {
	try {
		const { start, end } = getDateParamsFromUrl(request);
		const validation = validateDateRange(start, end);
		if (!validation.success) {
			return validation.error;
		}

		const url = new URL(request.url);
		const granularity = (url.searchParams.get("granularity") ?? "day") as
			| "hour"
			| "day"
			| "month";
		const timezone = url.searchParams.get("timezone") ?? "UTC";

		const cacheKey = buildCacheKey("cache-token-chart", request);
		const data = await withCache(cacheKey, () =>
			getCacheTokenTimeSeries({ ...validation.data, granularity, timezone }),
		);
		return NextResponse.json(data);
	} catch (e) {
		console.error("Error in cache-token-chart API:", e);
		return NextResponse.json({ error: (e as Error).message }, { status: 500 });
	}
}
