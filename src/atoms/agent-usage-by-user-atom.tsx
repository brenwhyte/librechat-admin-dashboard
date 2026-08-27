import { atom } from "jotai";
import type { AgentUsageByUser } from "@/components/models/agent-usage-by-user";
import { API_BASE } from "@/lib/utils/api-base";
import { queuedFetch } from "@/lib/utils/fetch-queue";
import { dateRangeAtom } from "./date-range-atom";
import { widgetRetryAtoms } from "./widget-retry-atoms";

export const agentUsageByUserAtom = atom(async (get) => {
	get(widgetRetryAtoms.agentUsageByUser); // retry dependency — bump to re-fetch only this widget
	const timeArea = get(dateRangeAtom);
	const res = await queuedFetch(
		`${API_BASE}/agent-usage-by-user?start=${timeArea?.startDate?.toISOString()}&end=${timeArea?.endDate?.toISOString()}`,
	);
	if (!res.ok) throw new Error(`agent-usage-by-user API error: ${res.status}`);
	const data: AgentUsageByUser[] = await res.json();
	if (!Array.isArray(data)) return [];
	return data;
});
