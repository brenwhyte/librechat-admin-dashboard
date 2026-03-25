import { atom } from "jotai";
import type { CostByDomain } from "@/components/models/cost-by-domain";
import { API_BASE } from "@/lib/utils/api-base";
import { dateRangeAtom } from "./date-range-atom";

export const costByDomainAtom = atom(async (get) => {
	const timeArea = get(dateRangeAtom);
	const res = await fetch(
		`${API_BASE}/cost-by-domain?start=${timeArea?.startDate?.toISOString()}&end=${timeArea?.endDate?.toISOString()}`,
	);
	const data: CostByDomain[] = await res.json();
	return data;
});
