import { atom } from "jotai";
import type { AllAgentsStatsTable } from "@/components/models/all-agents-stats-table";
import { API_BASE } from "@/lib/utils/api-base";
import { dateRangeAtom } from "./date-range-atom";

export const allAgentsStatsTableAtom = atom(async (get) => {
	const timeArea = get(dateRangeAtom);
	const res = await fetch(
		`${API_BASE}/all-agents-stats-table?start=${timeArea?.startDate?.toISOString()}&end=${timeArea?.endDate?.toISOString()}`,
	);
	if (!res.ok)
		throw new Error(`all-agents-stats-table API error: ${res.status}`);
	const data: AllAgentsStatsTable[] = await res.json();
	if (!Array.isArray(data)) return [];
	return data;
});
