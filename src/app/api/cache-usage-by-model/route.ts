import { NextResponse } from "next/server";
import { buildCacheKey, withCache } from "@/lib/api/cache";
import {
	getDateParamsFromUrl,
	validateDateRange,
} from "@/lib/api/date-validation";
import { getCacheUsageByModel } from "@/lib/db/repositories";

export async function GET(request: Request) {
	try {
		const { start, end } = getDateParamsFromUrl(request);
		const validation = validateDateRange(start, end);
		if (!validation.success) {
			return validation.error;
		}

		const cacheKey = buildCacheKey("cache-usage-by-model", request);
		const data = await withCache(cacheKey, () =>
			getCacheUsageByModel(validation.data),
		);
		return NextResponse.json(data);
	} catch (e) {
		console.error("Error in cache-usage-by-model API:", e);
		return NextResponse.json({ error: (e as Error).message }, { status: 500 });
	}
}
