import { NextResponse } from "next/server";
import { buildCacheKey, withCache } from "@/lib/api/cache";
import { validateAndCalculatePeriod } from "@/lib/api/date-validation";
import { getWebSearchStats } from "@/lib/db/repositories";

export async function GET(request: Request) {
	try {
		const validation = validateAndCalculatePeriod(request);
		if (!validation.success) {
			return validation.error;
		}

		const cacheKey = buildCacheKey("web-search-stats", request);
		const data = await withCache(cacheKey, () =>
			getWebSearchStats(validation.data),
		);
		return NextResponse.json(data);
	} catch (e) {
		console.error("Error in web-search-stats API:", e);
		return NextResponse.json({ error: (e as Error).message }, { status: 500 });
	}
}
