import { NextResponse } from "next/server";
import { buildCacheKey, withCache } from "@/lib/api/cache";
import { validateAndCalculatePeriod } from "@/lib/api/date-validation";
import { getFilesProcessedStats } from "@/lib/db/repositories/file-stats.repository";

export async function GET(request: Request) {
	try {
		const validation = validateAndCalculatePeriod(request);
		if (!validation.success) {
			return validation.error;
		}

		const cacheKey = buildCacheKey("files-processed", request);
		const data = await withCache(cacheKey, () =>
			getFilesProcessedStats(validation.data),
		);
		return NextResponse.json(data);
	} catch (e) {
		console.error("Error in files-processed API:", e);
		return NextResponse.json({ error: (e as Error).message }, { status: 500 });
	}
}
