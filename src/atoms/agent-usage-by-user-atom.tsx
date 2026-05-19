import { atom } from "jotai";
import type { AgentUsageByUser } from "@/components/models/agent-usage-by-user";
import { API_BASE } from "@/lib/utils/api-base";
import { dateRangeAtom } from "./date-range-atom";

export const agentUsageByUserAtom = atom(async (get) => {
	const timeArea = get(dateRangeAtom);
	const res = await fetch(
		`${API_BASE}/agent-usage-by-user?start=${timeArea?.startDate?.toISOString()}&end=${timeArea?.endDate?.toISOString()}`,
	);
	if (!res.ok) throw new Error(`agent-usage-by-user API error: ${res.status}`);
	const data: AgentUsageByUser[] = await res.json();
	if (!Array.isArray(data)) return [];
	return data;
});
