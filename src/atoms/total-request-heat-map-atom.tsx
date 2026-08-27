import { startOfDay } from "date-fns";
import { atom } from "jotai";
import type { RequestHeatMap } from "@/components/models/request-heat-map";
import { API_BASE } from "@/lib/utils/api-base";
import { queuedFetch } from "@/lib/utils/fetch-queue";
import { dateRangeAtom } from "./date-range-atom";
import { widgetRetryAtoms } from "./widget-retry-atoms";

/**
 * Heatmap data caching
 *
 * Since heatmap data is aggregated by day-of-week and hour, it doesn't need
 * to refresh every 30 seconds. We cache based on the date range (day-level).
 *
 * The cache key is based on calendar dates only, not timestamps.
 * Data is refreshed only when:
 * 1. The date range changes (user picks different dates)
 * 2. The retry counter is incremented (per-widget retry button)
 */
interface HeatmapCache {
	key: string;
	data: RequestHeatMap[];
	promise: Promise<RequestHeatMap[]> | null;
}

const cache: HeatmapCache = {
	key: "",
	data: [],
	promise: null,
};

async function fetchHeatmapData(
	startDate: Date,
	endDate: Date,
): Promise<RequestHeatMap[]> {
	const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const res = await queuedFetch(
		`${API_BASE}/total-request-heat-map?start=${startDate.toISOString()}&end=${endDate.toISOString()}&timezone=${encodeURIComponent(timezone)}`,
	);
	if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
	return res.json();
}

export const totalRequestHeatMapAtom = atom(async (get) => {
	const retryCount = get(widgetRetryAtoms.totalRequestHeatMap); // retry dependency
	const dateRange = get(dateRangeAtom);

	// Guard against null dates
	if (!dateRange.startDate || !dateRange.endDate) {
		return [];
	}

	// Create cache key based on day-level dates only (+ retry count to bust on manual retry)
	const startKey = startOfDay(dateRange.startDate).toISOString().split("T")[0];
	const endKey = startOfDay(dateRange.endDate).toISOString().split("T")[0];
	const cacheKey = `${startKey}_${endKey}_r${retryCount}`;

	// Return cached data if date range (day-level) hasn't changed
	if (cacheKey === cache.key && cache.data.length > 0) {
		return cache.data;
	}

	// If there's already a pending request for this key, wait for it
	if (cacheKey === cache.key && cache.promise) {
		return cache.promise;
	}

	// Start new fetch and cache the promise
	cache.key = cacheKey;
	cache.promise = fetchHeatmapData(dateRange.startDate, dateRange.endDate);

	try {
		const data = await cache.promise;
		cache.data = data;
		cache.promise = null;
		return data;
	} catch (error) {
		cache.promise = null;
		throw error;
	}
});
