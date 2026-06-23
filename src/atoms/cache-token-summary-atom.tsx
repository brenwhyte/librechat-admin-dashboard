import { atom } from "jotai";
import type { CacheTokenSummary } from "@/components/models/cache-token-summary";
import { API_BASE } from "@/lib/utils/api-base";
import { dateRangeAtom } from "./date-range-atom";

export const cacheTokenSummaryAtom = atom(async (get) => {
	const timeArea = get(dateRangeAtom);
	const res = await fetch(
		`${API_BASE}/cache-token-summary?start=${timeArea?.startDate?.toISOString()}&end=${timeArea?.endDate?.toISOString()}`,
	);
	if (!res.ok) throw new Error(`cache-token-summary API error: ${res.status}`);
	const data: CacheTokenSummary[] = await res.json();
	return data;
});
