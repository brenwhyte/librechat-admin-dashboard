import { atom } from "jotai";
import type { CostByDomain } from "@/components/models/cost-by-domain";
import { API_BASE } from "@/lib/utils/api-base";
import { queuedFetch } from "@/lib/utils/fetch-queue";
import { dateRangeAtom } from "./date-range-atom";
import { widgetRetryAtoms } from "./widget-retry-atoms";

export const costByDomainAtom = atom(async (get) => {
	get(widgetRetryAtoms.costByDomain); // retry dependency — bump to re-fetch only this widget
	const timeArea = get(dateRangeAtom);
	const res = await queuedFetch(
		`${API_BASE}/cost-by-domain?start=${timeArea?.startDate?.toISOString()}&end=${timeArea?.endDate?.toISOString()}`,
	);
	const data: CostByDomain[] = await res.json();
	return data;
});
