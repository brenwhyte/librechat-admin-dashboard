"use client";

import RefreshIcon from "@mui/icons-material/Refresh";
import { IconButton, Tooltip } from "@mui/material";
import { useSetAtom, type WritableAtom } from "jotai";
import { useCallback } from "react";

interface WidgetRetryButtonProps {
	/** The primitive counter atom to increment on click. */
	retryAtom: WritableAtom<number, [number | ((prev: number) => number)], void>;
	/** Optional accessible label override. Defaults to "Retry". */
	label?: string;
}

/**
 * Compact inline retry control for dashboard widgets.
 *
 * Increments the widget-specific retry counter atom, which causes only
 * the matching data atom to re-fetch (via Jotai dependency tracking).
 * The global date range and all other widgets are unaffected.
 *
 * Visual conventions follow the existing DashboardErrorBoundary and
 * the global ReloadButton: MUI IconButton + RefreshIcon + Tooltip.
 */
const WidgetRetryButton = ({
	retryAtom,
	label = "Retry",
}: WidgetRetryButtonProps) => {
	const setRetry = useSetAtom(retryAtom);

	const handleRetry = useCallback(() => {
		setRetry((n) => n + 1);
	}, [setRetry]);

	return (
		<Tooltip title={label} placement="top" arrow>
			<IconButton
				onClick={handleRetry}
				size="small"
				aria-label={label}
				sx={{
					mt: 1,
					color: "error.main",
					opacity: 0.75,
					"&:hover": { opacity: 1 },
				}}
			>
				<RefreshIcon fontSize="small" />
			</IconButton>
		</Tooltip>
	);
};

export default WidgetRetryButton;
