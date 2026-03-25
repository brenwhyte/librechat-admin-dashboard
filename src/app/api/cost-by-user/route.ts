import { NextResponse } from "next/server";
import { buildCacheKey, withCache } from "@/lib/api/cache";
import {
	getDateParamsFromUrl,
	validateDateRange,
} from "@/lib/api/date-validation";
import { getCostByUser } from "@/lib/db/repositories";

export async function GET(request: Request) {
	try {
		const { start, end } = getDateParamsFromUrl(request);
		const validation = validateDateRange(start, end);
		if (!validation.success) {
			return validation.error;
		}

		const cacheKey = buildCacheKey("cost-by-user", request);
		const data = await withCache(cacheKey, () =>
			getCostByUser(validation.data),
		);
		return NextResponse.json(data);
	} catch (e) {
		console.error("Error in cost-by-user API:", e);
		return NextResponse.json({ error: (e as Error).message }, { status: 500 });
	}
}
