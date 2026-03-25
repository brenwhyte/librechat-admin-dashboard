import { NextResponse } from "next/server";
import { buildCacheKey, withCache } from "@/lib/api/cache";
import { validateAndCalculatePeriod } from "@/lib/api/date-validation";
import { getActiveUsers } from "@/lib/db/repositories";

export async function GET(request: Request) {
	try {
		const validation = validateAndCalculatePeriod(request);
		if (!validation.success) {
			return validation.error;
		}

		const cacheKey = buildCacheKey("active-users", request);
		const data = await withCache(cacheKey, () =>
			getActiveUsers(validation.data),
		);
		return NextResponse.json(data);
	} catch (e) {
		console.error("Error in active-users API:", e);
		return NextResponse.json({ error: (e as Error).message }, { status: 500 });
	}
}
