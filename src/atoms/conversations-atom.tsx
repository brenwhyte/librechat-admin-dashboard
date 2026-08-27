import { atom } from "jotai";
import type { Conversations } from "@/components/models/conversations";
import { API_BASE } from "@/lib/utils/api-base";
import { queuedFetch } from "@/lib/utils/fetch-queue";
import { dateRangeAtom } from "./date-range-atom";

export const conversationsAtom = atom(async (get) => {
	const timeArea = get(dateRangeAtom);
	const res = await queuedFetch(
		`${API_BASE}/conversations?start=${timeArea?.startDate?.toISOString()}&end=${timeArea?.endDate?.toISOString()}`,
	);
	const data: Conversations[] = await res.json();
	return data;
});
