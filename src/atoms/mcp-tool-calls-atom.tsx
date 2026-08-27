import { atom } from "jotai";
import type { McpToolCalls } from "@/components/models/mcp-tool-calls";
import { API_BASE } from "@/lib/utils/api-base";
import { queuedFetch } from "@/lib/utils/fetch-queue";
import { dateRangeAtom } from "./date-range-atom";

export const mcpToolCallsAtom = atom(async (get) => {
	const dateRange = get(dateRangeAtom);
	const res = await queuedFetch(
		`${API_BASE}/mcp-tool-calls?start=${dateRange?.startDate?.toISOString()}&end=${dateRange?.endDate?.toISOString()}`,
	);
	if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
	const data: McpToolCalls = await res.json();
	return data;
});
