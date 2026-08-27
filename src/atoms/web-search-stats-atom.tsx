import { atom } from "jotai";
import { API_BASE } from "@/lib/utils/api-base";
import { queuedFetch } from "@/lib/utils/fetch-queue";
import { dateRangeAtom } from "./date-range-atom";

export interface WebSearchStatsEntry {
	searchCount: number;
	uniqueUsers: number;
	uniqueConversations: number;
}

export interface WebSearchStatsResponse {
	current: WebSearchStatsEntry;
	prev: WebSearchStatsEntry;
}

export const webSearchStatsAtom = atom<Promise<WebSearchStatsResponse>>(
	async (get) => {
		const dateRange = get(dateRangeAtom);
		const params = new URLSearchParams({
			start: dateRange.startDate?.toISOString() ?? "",
			end: dateRange.endDate?.toISOString() ?? "",
		});

		const response = await queuedFetch(
			`${API_BASE}/web-search-stats?${params}`,
		);
		if (!response.ok) {
			throw new Error("Failed to fetch web search stats");
		}
		return response.json();
	},
);
