import { atom } from "jotai";
import type { CacheUsageByUser } from "@/components/models/cache-usage-by-user";
import { API_BASE } from "@/lib/utils/api-base";
import { dateRangeAtom } from "./date-range-atom";

export const cacheUsageByUserAtom = atom(async (get) => {
	const timeArea = get(dateRangeAtom);
	const res = await fetch(
		`${API_BASE}/cache-usage-by-user?start=${timeArea?.startDate?.toISOString()}&end=${timeArea?.endDate?.toISOString()}`,
	);
	if (!res.ok) throw new Error(`cache-usage-by-user API error: ${res.status}`);
	const data: CacheUsageByUser[] = await res.json();
	if (!Array.isArray(data)) return [];
	return data;
});
