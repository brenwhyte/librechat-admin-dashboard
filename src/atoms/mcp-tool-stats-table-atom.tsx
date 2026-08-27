import { atom } from "jotai";
import type { McpToolStatsTable } from "@/components/models/mcp-tool-stats";
import { API_BASE } from "@/lib/utils/api-base";
import { queuedFetch } from "@/lib/utils/fetch-queue";
import { dateRangeAtom } from "./date-range-atom";

export const mcpToolStatsTableAtom = atom<Promise<McpToolStatsTable[]>>(
	async (get) => {
		const dateRange = get(dateRangeAtom);
		const params = new URLSearchParams({
			start: dateRange.startDate?.toISOString() ?? "",
			end: dateRange.endDate?.toISOString() ?? "",
		});

		const response = await queuedFetch(
			`${API_BASE}/mcp-tool-stats-table?${params}`,
		);
		if (!response.ok) {
			throw new Error("Failed to fetch MCP tool stats table");
		}
		return response.json();
	},
);
