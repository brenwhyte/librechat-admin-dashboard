import { atom } from "jotai";
import type { CostByUser } from "@/components/models/cost-by-user";
import { API_BASE } from "@/lib/utils/api-base";
import { dateRangeAtom } from "./date-range-atom";

export const costByUserAtom = atom(async (get) => {
	const timeArea = get(dateRangeAtom);
	const res = await fetch(
		`${API_BASE}/cost-by-user?start=${timeArea?.startDate?.toISOString()}&end=${timeArea?.endDate?.toISOString()}`,
	);
	if (!res.ok) throw new Error(`cost-by-user API error: ${res.status}`);
	const data: CostByUser[] = await res.json();
	if (!Array.isArray(data)) return [];
	return data;
});
