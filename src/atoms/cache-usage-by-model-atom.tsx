import { atom } from "jotai";
import type { CacheUsageByModel } from "@/components/models/cache-usage-by-model";
import { API_BASE } from "@/lib/utils/api-base";
import { dateRangeAtom } from "./date-range-atom";

export const cacheUsageByModelAtom = atom(async (get) => {
	const timeArea = get(dateRangeAtom);
	const res = await fetch(
		`${API_BASE}/cache-usage-by-model?start=${timeArea?.startDate?.toISOString()}&end=${timeArea?.endDate?.toISOString()}`,
	);
	if (!res.ok) throw new Error(`cache-usage-by-model API error: ${res.status}`);
	const data: CacheUsageByModel[] = await res.json();
	if (!Array.isArray(data)) return [];
	return data;
});
