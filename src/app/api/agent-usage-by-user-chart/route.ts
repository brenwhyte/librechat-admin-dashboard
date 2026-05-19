import { NextResponse } from "next/server";
import { buildCacheKey, withCache } from "@/lib/api/cache";
import {
	getDateParamsFromUrl,
	validateDateRange,
} from "@/lib/api/date-validation";
import { getAgentUsageByUserTimeSeries } from "@/lib/db/repositories";
import type { TimeGranularity } from "@/lib/db/types";

const TIME_AREA_TO_GRANULARITY: Record<string, TimeGranularity> = {
	day: "hour",
	week: "day",
	month: "day",
	year: "month",
};

const VALID_TIME_AREAS = ["day", "week", "month", "year"];

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url);
		const { start, end } = getDateParamsFromUrl(request);
		const userId = searchParams.get("userId");
		const agentId = searchParams.get("agentId");
		const timeArea = searchParams.get("groupRange");
		const timezone = searchParams.get("timezone") || "UTC";

		const validation = validateDateRange(start, end);
		if (!validation.success) {
			return validation.error;
		}

		if (!userId) {
			return NextResponse.json(
				{ error: "Missing required query parameter: userId" },
				{ status: 400 },
			);
		}

		if (!agentId) {
			return NextResponse.json(
				{ error: "Missing required query parameter: agentId" },
				{ status: 400 },
			);
		}

		if (!timeArea || !VALID_TIME_AREAS.includes(timeArea)) {
			return NextResponse.json(
				{
					error:
						"Invalid or missing groupRange parameter. Valid values: day, week, month, year",
				},
				{ status: 400 },
			);
		}

		const granularity = TIME_AREA_TO_GRANULARITY[timeArea];
		const cacheKey = buildCacheKey("agent-usage-by-user-chart", request);
		const data = await withCache(cacheKey, () =>
			getAgentUsageByUserTimeSeries({
				...validation.data,
				userId,
				agentId,
				granularity,
				timezone,
			}),
		);

		return NextResponse.json(data);
	} catch (e) {
		console.error("Error in agent-usage-by-user-chart API:", e);
		return NextResponse.json({ error: (e as Error).message }, { status: 500 });
	}
}
