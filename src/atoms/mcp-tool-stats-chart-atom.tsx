import { atom } from "jotai";
import type { McpToolStatsChartResponse } from "@/components/models/mcp-tool-stats";
import { API_BASE } from "@/lib/utils/api-base";
import { queuedFetch } from "@/lib/utils/fetch-queue";
import { dateRangeAtom } from "./date-range-atom";

export const mcpToolStatsChartAtom = atom<Promise<McpToolStatsChartResponse>>(
	async (get) => {
		const dateRange = get(dateRangeAtom);
		const params = new URLSearchParams({
			start: dateRange.startDate?.toISOString() ?? "",
			end: dateRange.endDate?.toISOString() ?? "",
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		});

		const response = await queuedFetch(
			`${API_BASE}/mcp-tool-stats-chart?${params}`,
		);
		if (!response.ok) {
			throw new Error("Failed to fetch MCP tool stats chart");
		}
		return response.json();
	},
);
