import { atom } from "jotai";
import { atomFamily } from "jotai/utils";
import type { AgentUsageByUserChart } from "@/components/models/agent-usage-by-user-chart";
import { timeMap } from "@/components/utils/time-map";
import { API_BASE } from "@/lib/utils/api-base";
import { dateRangeAtom } from "./date-range-atom";

/**
 * Atom family keyed by "${userId}::${agentId}".
 * Fetches time-series data for a specific user+agent combination.
 */
export const agentUsageByUserChartAtom = atomFamily((key: string) =>
    atom(async (get) => {
        const timeArea = get(dateRangeAtom);
        const time = timeMap(timeArea);
        const [userId, agentId] = key.split("::");
        const res = await fetch(
            `${API_BASE}/agent-usage-by-user-chart?userId=${encodeURIComponent(userId)}&agentId=${encodeURIComponent(agentId)}&groupRange=${time}&start=${timeArea?.startDate?.toISOString()}&end=${timeArea?.endDate?.toISOString()}`,
        );
        const data: AgentUsageByUserChart[] = await res.json();
        return data;
    }),
);
