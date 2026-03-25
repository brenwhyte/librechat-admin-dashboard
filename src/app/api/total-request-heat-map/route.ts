import { NextResponse } from "next/server";
import { buildCacheKey, withCache } from "@/lib/api/cache";
import {
	getDateParamsFromUrl,
	validateDateRange,
} from "@/lib/api/date-validation";
import { getRequestHeatmap } from "@/lib/db/repositories";

export async function GET(request: Request) {
	try {
		const { start, end } = getDateParamsFromUrl(request);
		const validation = validateDateRange(start, end);
		if (!validation.success) {
			return validation.error;
		}

		const { searchParams } = new URL(request.url);
		const timezone = searchParams.get("timezone") || "UTC";

		const cacheKey = buildCacheKey("total-request-heat-map", request);
		const data = await withCache(cacheKey, () =>
			getRequestHeatmap({ ...validation.data, timezone }),
		);
		return NextResponse.json(data);
	} catch (e) {
		console.error("Error in total-request-heat-map API:", e);
		return NextResponse.json({ error: (e as Error).message }, { status: 500 });
	}
}
