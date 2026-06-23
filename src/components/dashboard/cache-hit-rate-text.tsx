"use client";

import PercentIcon from "@mui/icons-material/Percent";
import { Box, Tooltip, useColorScheme } from "@mui/material";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { useAtomValue } from "jotai";
import { loadable } from "jotai/utils";
import { useEffect, useMemo, useState } from "react";
import { cacheTokenSummaryAtom } from "@/atoms/cache-token-summary-atom";
import { useLoadableWithCache } from "@/hooks/useLoadableWithCache";

const loadableCacheSummaryAtom = loadable(cacheTokenSummaryAtom);

const CacheHitRateText = () => {
	const { data, showSkeleton, isRefetching } = useLoadableWithCache(
		loadableCacheSummaryAtom,
	);
	const [isClient, setIsClient] = useState(false);
	const { mode } = useColorScheme();

	useEffect(() => {
		setIsClient(true);
	}, []);

	const hitRate = useMemo(() => {
		if (!data || data.length === 0) return null;
		const {
			currentInputTokens = 0,
			currentWriteTokens = 0,
			currentReadTokens = 0,
		} = data[0];
		const total = currentInputTokens + currentWriteTokens + currentReadTokens;
		if (total === 0) return 0;
		return Math.round((currentReadTokens / total) * 1000) / 10;
	}, [data]);

	const hitRateDisplay = hitRate === null ? "—" : `${hitRate}%`;
	const tooltipText =
		hitRate === null
			? "No cache data in selected period"
			: `${hitRate}% of prompt tokens were served from cache`;

	return (
		<div
			style={{
				padding: "20px",
				alignItems: "center",
				display: "flex",
				flexDirection: "column",
				height: "100%",
			}}
		>
			<Box
				sx={{
					minHeight: "48px",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					gap: 1,
				}}
			>
				<PercentIcon
					sx={{
						fontSize: "1rem",
						color:
							mode === "dark" ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.5)",
					}}
				/>
				<Typography
					align="center"
					sx={{
						color:
							mode === "dark" ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)",
						fontSize: "13px",
						fontWeight: 500,
						letterSpacing: "0.02em",
						textTransform: "uppercase",
						lineHeight: 1.3,
					}}
				>
					Cache Hit Rate
				</Typography>
			</Box>
			{!isClient || showSkeleton ? (
				<div style={{ marginTop: "12px" }}>
					<Skeleton
						variant="text"
						width={100}
						height={40}
						sx={{
							margin: "0 auto",
							backgroundColor:
								mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
							borderRadius: "8px",
						}}
						animation="wave"
					/>
				</div>
			) : (
				<Box
					sx={{
						opacity: isRefetching ? 0.7 : 1,
						transition: "opacity 0.2s ease",
					}}
				>
					<Tooltip title={tooltipText} arrow placement="top" enterDelay={300}>
						<Typography
							variant="h5"
							marginTop="12px"
							align="center"
							sx={{
								fontWeight: 700,
								fontSize: "32px",
								letterSpacing: "-0.03em",
								background:
									mode === "dark"
										? "linear-gradient(135deg, #f5f5f7 0%, rgba(255,255,255,0.85) 100%)"
										: "linear-gradient(135deg, #1d1d1f 0%, rgba(0,0,0,0.85) 100%)",
								backgroundClip: "text",
								WebkitBackgroundClip: "text",
								WebkitTextFillColor: "transparent",
								cursor: "help",
							}}
						>
							{hitRateDisplay}
						</Typography>
					</Tooltip>
					<Typography
						align="center"
						fontSize="13px"
						sx={{
							color:
								mode === "dark" ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)",
							marginTop: "4px",
						}}
					>
						read / total prompt tokens
					</Typography>
				</Box>
			)}
		</div>
	);
};

export default CacheHitRateText;
