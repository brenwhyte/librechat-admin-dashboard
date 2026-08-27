import { atom } from "jotai";
import type { ProviderWithModelUsage } from "@/components/models/provider-with-model-usage";
import { API_BASE } from "@/lib/utils/api-base";
import { queuedFetch } from "@/lib/utils/fetch-queue";
import { dateRangeAtom } from "./date-range-atom";
import { widgetRetryAtoms } from "./widget-retry-atoms";

export const providerWithModelUsageAtom = atom(async (get) => {
	get(widgetRetryAtoms.providerWithModelUsage); // retry dependency — bump to re-fetch only this widget
	const timeArea = get(dateRangeAtom);
	const res = await queuedFetch(
		`${API_BASE}/provider-with-model-usage?start=${timeArea?.startDate?.toISOString()}&end=${timeArea?.endDate?.toISOString()}`,
	);
	if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
	const data: ProviderWithModelUsage[] = await res.json();
	return data;
});
