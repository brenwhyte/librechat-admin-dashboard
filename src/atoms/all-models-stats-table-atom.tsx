import { atom } from "jotai";
import type { AllModelsStatsTable } from "@/components/models/all-models-stats-table";
import { API_BASE } from "@/lib/utils/api-base";
import { dateRangeAtom } from "./date-range-atom";

export const allModelsStatsTableAtom = atom(async (get) => {
	const timeArea = get(dateRangeAtom);
	const res = await fetch(
		`${API_BASE}/all-models-stats-table?start=${timeArea?.startDate?.toISOString()}&end=${timeArea?.endDate?.toISOString()}`,
	);
	if (!res.ok)
		throw new Error(`all-models-stats-table API error: ${res.status}`);
	const data: AllModelsStatsTable[] = await res.json();
	if (!Array.isArray(data)) return [];
	return data;
});
