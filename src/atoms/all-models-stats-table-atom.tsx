import { atom } from "jotai";
import type { AllModelsStatsTable } from "@/components/models/all-models-stats-table";
import { API_BASE } from "@/lib/utils/api-base";
import { queuedFetch } from "@/lib/utils/fetch-queue";
import { dateRangeAtom } from "./date-range-atom";
import { widgetRetryAtoms } from "./widget-retry-atoms";

export const allModelsStatsTableAtom = atom(async (get) => {
	get(widgetRetryAtoms.allModelsStatsTable); // retry dependency — bump to re-fetch only this widget
	const timeArea = get(dateRangeAtom);
	const res = await queuedFetch(
		`${API_BASE}/all-models-stats-table?start=${timeArea?.startDate?.toISOString()}&end=${timeArea?.endDate?.toISOString()}`,
	);
	if (!res.ok)
		throw new Error(`all-models-stats-table API error: ${res.status}`);
	const data: AllModelsStatsTable[] = await res.json();
	if (!Array.isArray(data)) return [];
	return data;
});
