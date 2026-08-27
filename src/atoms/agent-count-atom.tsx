import { atom } from "jotai";
import type { AgentCount } from "@/components/models/agent-count";
import { API_BASE } from "@/lib/utils/api-base";
import { queuedFetch } from "@/lib/utils/fetch-queue";

// Above-the-fold KPI — high queue priority so it runs before secondary widgets.
export const agentCountAtom = atom(async () => {
	const res = await queuedFetch(`${API_BASE}/all-agents`, {
		queuePriority: "high",
	});
	const data: AgentCount[] = await res.json();
	return data;
});
