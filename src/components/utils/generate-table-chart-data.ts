import {
	addDays,
	addHours,
	addMonths,
	differenceInCalendarDays,
	differenceInHours,
} from "date-fns";
import type { DateRange } from "../models/date-range";
import type { StatsTableChartItem } from "../models/stats-table-chart-item";

interface TimeGroupedDataEntry {
	hour?: string;
	day?: string;
	month?: string;
	totalInputToken: number;
	totalOutputToken: number;
	requests: number;
}

export function generateChartData<T extends TimeGroupedDataEntry>(
	range: DateRange,
	dataEntries: T[],
): StatsTableChartItem[] {
	const { startDate, endDate } = range;
	if (!startDate || !endDate) return [];

	const data: StatsTableChartItem[] = [];
	const sumInputToken = (entries: T[]) =>
		entries.reduce((sum, e) => sum + e.totalInputToken, 0);
	const sumOutputToken = (entries: T[]) =>
		entries.reduce((sum, e) => sum + e.totalOutputToken, 0);
	const sumRequests = (entries: T[]) =>
		entries.reduce((sum, e) => sum + e.requests, 0);

	const dayDiff = differenceInCalendarDays(endDate, startDate);

	if (dayDiff <= 2) {
		const hourDiff = differenceInHours(endDate, startDate);
		for (let i = 0; i <= hourDiff; i++) {
			const slotTime = addHours(startDate, i);
			const dayPart = String(slotTime.getDate()).padStart(2, "0");
			const hourPart = `${String(slotTime.getHours()).padStart(2, "0")}:00`;
			const label = `${dayPart}, ${hourPart}`;

			const entriesForHour = dataEntries.filter(
				(entry) => entry.hour === label,
			);
			data.push({
				label,
				totalInputToken: sumInputToken(entriesForHour),
				totalOutputToken: sumOutputToken(entriesForHour),
				requests: sumRequests(entriesForHour),
			});
		}
	} else if (dayDiff <= 90) {
		for (let i = 0; i <= dayDiff; i++) {
			const slotTime = addDays(startDate, i);
			const weekday = slotTime.toLocaleDateString("en-US", {
				weekday: "short",
			});
			const dayStr = slotTime.getDate().toString().padStart(2, "0");
			const monthStr = (slotTime.getMonth() + 1).toString().padStart(2, "0");
			const label = `${weekday}, ${dayStr}.${monthStr}`;
			const isoDay = `${slotTime.getFullYear()}-${monthStr}-${dayStr}`;

			const entriesForDay = dataEntries.filter((entry) => entry.day === isoDay);
			data.push({
				label,
				totalInputToken: sumInputToken(entriesForDay),
				totalOutputToken: sumOutputToken(entriesForDay),
				requests: sumRequests(entriesForDay),
			});
		}
	} else {
		const startYear = startDate.getFullYear();
		const startMonth = startDate.getMonth();
		const endYear = endDate.getFullYear();
		const endMonth = endDate.getMonth();
		const totalMonths =
			(endYear - startYear) * 12 + (endMonth - startMonth) + 1;
		const monthNames = [
			"Jan.",
			"Feb.",
			"Mär.",
			"Apr.",
			"Mai",
			"Jun.",
			"Jul.",
			"Aug.",
			"Sep.",
			"Okt.",
			"Nov.",
			"Dez.",
		];

		for (let i = 0; i < totalMonths; i++) {
			const slotTime = addMonths(startDate, i);
			const monthStr = (slotTime.getMonth() + 1).toString().padStart(2, "0");
			const label = `${monthNames[slotTime.getMonth()]} ${slotTime.getFullYear()}`;
			const isoMonth = `${slotTime.getFullYear()}-${monthStr}`;

			// 4. Fixed the 'allMessages' bug here too
			const entriesForMonth = dataEntries.filter(
				(entry) => entry.month === isoMonth,
			);
			data.push({
				label,
				totalInputToken: sumInputToken(entriesForMonth),
				totalOutputToken: sumOutputToken(entriesForMonth),
				requests: sumRequests(entriesForMonth),
			});
		}
	}

	return data;
}
