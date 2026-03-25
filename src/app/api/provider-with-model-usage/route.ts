import { NextResponse } from "next/server";
import { buildCacheKey, withCache } from "@/lib/api/cache";
import {
	getDateParamsFromUrl,
	validateDateRange,
} from "@/lib/api/date-validation";
import { getModelUsageByProvider } from "@/lib/db/repositories";

export async function GET(request: Request) {
	try {
		const { start, end } = getDateParamsFromUrl(request);
		const validation = validateDateRange(start, end);
		if (!validation.success) {
			return validation.error;
		}

		const cacheKey = buildCacheKey("provider-with-model-usage", request);
		const data = await withCache(cacheKey, () =>
			getModelUsageByProvider(validation.data),
		);
		return NextResponse.json(data);
	} catch (e) {
		console.error("Error in provider-with-model-usage API:", e);
		return NextResponse.json({ error: (e as Error).message }, { status: 500 });
	}
}
