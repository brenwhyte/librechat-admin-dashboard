/**
 * Per-widget retry counter atoms.
 *
 * Each atom is a plain integer counter. A widget's data atom reads its
 * corresponding counter so that bumping the counter (incrementing it) marks
 * the data atom as stale and causes Jotai to re-run only that one fetch —
 * without touching dateRangeAtom or triggering a global refresh.
 *
 * Usage in a data atom:
 *   get(widgetRetryAtoms.costByDomain); // declare dependency
 *
 * Usage in a component (retry button):
 *   const setRetry = useSetAtom(widgetRetryAtoms.costByDomain);
 *   <button onClick={() => setRetry(n => n + 1)}>Retry</button>
 */

import { atom } from "jotai";

export const widgetRetryAtoms = {
	costByDomain: atom(0),
	providerWithModelUsage: atom(0),
	totalRequestHeatMap: atom(0),
	mcpToolStatsTable: atom(0),
	allModelsStatsTable: atom(0),
	agentUsageByUser: atom(0),
	allAgentsStatsTable: atom(0),
	costByUser: atom(0),
} as const;
