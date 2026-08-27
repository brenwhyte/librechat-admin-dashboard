import { atom } from "jotai";
import type { CostByDomain } from "@/components/models/cost-by-domain";
import { API_BASE } from "@/lib/utils/api-base";
import { queuedFetch } from "@/lib/utils/fetch-queue";
import { dateRangeAtom } from "./date-range-atom";

export interface EstimatedCostSummary {
	totalEstimatedCost: number;
	totalTokens: number;
	totalTransactions: number;
	domainCount: number;
	userCount: number;
}

// Above-the-fold KPI — high queue priority so it runs before secondary widgets.
export const estimatedCostAtom = atom(async (get) => {
	const timeArea = get(dateRangeAtom);
	const res = await queuedFetch(
		`${API_BASE}/cost-by-domain?start=${timeArea?.startDate?.toISOString()}&end=${timeArea?.endDate?.toISOString()}`,
		{ queuePriority: "high" },
	);
	const domains: CostByDomain[] = await res.json();

	const summary: EstimatedCostSummary = {
		totalEstimatedCost: domains.reduce((sum, d) => sum + d.totalCost, 0),
		totalTokens: domains.reduce((sum, d) => sum + d.totalTokens, 0),
		totalTransactions: domains.reduce((sum, d) => sum + d.transactionCount, 0),
		domainCount: domains.length,
		userCount: domains.reduce((sum, d) => sum + d.userCount, 0),
	};

	return [summary];
});
