import { atom } from "jotai";
import type { AvgTokensPerMessage } from "@/components/models/avg-tokens-per-message";
import { API_BASE } from "@/lib/utils/api-base";
import { queuedFetch } from "@/lib/utils/fetch-queue";
import { dateRangeAtom } from "./date-range-atom";

// Above-the-fold KPI — high queue priority so it runs before secondary widgets.
export const tokensPerMessageAtom = atom(async (get) => {
	const timeArea = get(dateRangeAtom);
	const res = await queuedFetch(
		`${API_BASE}/avg-stats-per-message?start=${timeArea?.startDate?.toISOString()}&end=${timeArea?.endDate?.toISOString()}`,
		{ queuePriority: "high" },
	);
	if (!res.ok) throw new Error(`HTTP Error${res.status}`);
	const data: AvgTokensPerMessage[] = await res.json();
	return data;
});
