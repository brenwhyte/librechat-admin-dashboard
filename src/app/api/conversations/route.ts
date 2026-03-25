import { NextResponse } from "next/server";
import { buildCacheKey, withCache } from "@/lib/api/cache";
import { validateAndCalculatePeriod } from "@/lib/api/date-validation";
import { getConversations } from "@/lib/db/repositories";

export async function GET(request: Request) {
	try {
		const validation = validateAndCalculatePeriod(request);
		if (!validation.success) {
			return validation.error;
		}

		const cacheKey = buildCacheKey("conversations", request);
		const data = await withCache(cacheKey, () =>
			getConversations(validation.data),
		);
		return NextResponse.json(data);
	} catch (e) {
		console.error("Error in conversations API:", e);
		return NextResponse.json({ error: (e as Error).message }, { status: 500 });
	}
}
