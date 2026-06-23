import { NextResponse } from "next/server";
import { buildCacheKey, withCache } from "@/lib/api/cache";
import { validateAndCalculatePeriod } from "@/lib/api/date-validation";
import { getCacheTokenSummary } from "@/lib/db/repositories";

export async function GET(request: Request) {
	try {
		const validation = validateAndCalculatePeriod(request);
		if (!validation.success) {
			return validation.error;
		}

		const cacheKey = buildCacheKey("cache-token-summary", request);
		const data = await withCache(cacheKey, () =>
			getCacheTokenSummary(validation.data),
		);
		return NextResponse.json(data);
	} catch (e) {
		console.error("Error in cache-token-summary API:", e);
		return NextResponse.json({ error: (e as Error).message }, { status: 500 });
	}
}
