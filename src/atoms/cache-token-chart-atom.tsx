import { atom } from "jotai";
import type { CacheTokenTimeSeries } from "@/components/models/cache-token-timeseries";
import { API_BASE } from "@/lib/utils/api-base";
import { dateRangeAtom } from "./date-range-atom";

export const cacheTokenChartAtom = atom(async (get) => {
	const timeArea = get(dateRangeAtom);
	const res = await fetch(
		`${API_BASE}/cache-token-chart?start=${timeArea?.startDate?.toISOString()}&end=${timeArea?.endDate?.toISOString()}`,
	);
	if (!res.ok) throw new Error(`cache-token-chart API error: ${res.status}`);
	const data: CacheTokenTimeSeries[] = await res.json();
	if (!Array.isArray(data)) return [];
	return data;
});
