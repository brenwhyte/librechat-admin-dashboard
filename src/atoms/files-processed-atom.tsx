import { atom } from "jotai";
import { loadable } from "jotai/utils";
import { API_BASE } from "@/lib/utils/api-base";
import { queuedFetch } from "@/lib/utils/fetch-queue";
import { dateRangeAtom } from "./date-range-atom";

const filesProcessedAsyncAtom = atom(async (get) => {
	const dateRange = get(dateRangeAtom);

	if (!dateRange.startDate || !dateRange.endDate) {
		return null;
	}

	const res = await queuedFetch(
		`${API_BASE}/files-processed?start=${dateRange.startDate.toISOString()}&end=${dateRange.endDate.toISOString()}`,
	);

	if (!res.ok) {
		throw new Error("Failed to fetch files processed stats");
	}

	return res.json();
});

export const filesProcessedAtom = loadable(filesProcessedAsyncAtom);
