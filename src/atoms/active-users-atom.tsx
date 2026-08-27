import { atom } from "jotai";
import type { ActiveUsers } from "@/components/models/active-users";
import { API_BASE } from "@/lib/utils/api-base";
import { queuedFetch } from "@/lib/utils/fetch-queue";
import { dateRangeAtom } from "./date-range-atom";

export const activeUsersAtom = atom(async (get) => {
	const timeArea = get(dateRangeAtom);
	const res = await queuedFetch(
		`${API_BASE}/active-users?start=${timeArea?.startDate?.toISOString()}&end=${timeArea?.endDate?.toISOString()}`,
	);
	const data: ActiveUsers[] = await res.json();
	return data;
});
