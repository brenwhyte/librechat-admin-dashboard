import { atom } from "jotai";
import { atomFamily } from "jotai/utils";
import type { AllModelsStatsChart } from "@/components/models/all-models-stats-chart";
import { timeMap } from "@/components/utils/time-map";
import { API_BASE } from "@/lib/utils/api-base";
import { dateRangeAtom } from "./date-range-atom";

export const allModelsStatsTableChartAtom = atomFamily((model: string) =>
	atom(async (get) => {
		const timeArea = get(dateRangeAtom);
		const time = timeMap(timeArea);
		const res = await fetch(
			`${API_BASE}/all-models-stats-table-chart?groupRange=${time}&model=${encodeURIComponent(model)}&start=${timeArea?.startDate?.toISOString()}&end=${timeArea?.endDate?.toISOString()}`,
		);
		if (!res.ok)
			throw new Error(`all-models-stats-table-chart API error: ${res.status}`);
		const data: AllModelsStatsChart[] = await res.json();
		if (!Array.isArray(data)) return [];
		return data;
	}),
);
