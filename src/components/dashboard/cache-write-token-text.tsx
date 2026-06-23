"use client";

import CachedIcon from "@mui/icons-material/Cached";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import { Box, Tooltip, useColorScheme } from "@mui/material";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { useAtomValue } from "jotai";
import { loadable } from "jotai/utils";
import { useEffect, useMemo, useState } from "react";
import { cacheTokenSummaryAtom } from "@/atoms/cache-token-summary-atom";
import {
	formatLargeNumber,
	formatTrendValue,
} from "@/components/utils/format-number";
import { useLoadableWithCache } from "@/hooks/useLoadableWithCache";

const loadableCacheSummaryAtom = loadable(cacheTokenSummaryAtom);

const CacheWriteTokenText = () => {
	const { data, showSkeleton, isRefetching, isFirstLoad } =
		useLoadableWithCache(loadableCacheSummaryAtom);
	const [isClient, setIsClient] = useState(false);
	const { mode } = useColorScheme();

	useEffect(() => {
		setIsClient(true);
	}, []);

	const { trendValue, showTrend } = useMemo(() => {
		if (!data || data.length === 0 || isFirstLoad)
			return { trendValue: null, showTrend: false };
		const delta =
			(data[0].currentWriteTokens ?? 0) - (data[0].prevWriteTokens ?? 0);
		return { trendValue: delta, showTrend: true };
	}, [data, isFirstLoad]);

	const formattedValue = useMemo(
		() => formatLargeNumber(data?.[0]?.currentWriteTokens),
		[data],
	);
	const formattedTrend = useMemo(
		() => formatTrendValue(trendValue),
		[trendValue],
	);

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
				<CachedIcon
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
					Cache Written
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
					<Skeleton
						variant="text"
						width={80}
						height={30}
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
					<Tooltip
						title={formattedValue.full}
						arrow
						placement="top"
						enterDelay={300}
					>
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
							{formattedValue.short}
						</Typography>
					</Tooltip>
					{showTrend && trendValue !== null && trendValue !== 0 && (
						<Tooltip
							title={formattedTrend.full}
							arrow
							placement="bottom"
							enterDelay={300}
						>
							<Typography
								align="center"
								fontSize="13px"
								sx={{
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									gap: "4px",
									marginTop: "4px",
									fontWeight: 500,
									color: trendValue > 0 ? "#30d158" : "#ff453a",
									cursor: "help",
								}}
							>
								{trendValue > 0 ? (
									<TrendingUpIcon sx={{ fontSize: "16px" }} />
								) : (
									<TrendingDownIcon sx={{ fontSize: "16px" }} />
								)}
								{formattedTrend.short}
							</Typography>
						</Tooltip>
					)}
					{showTrend && trendValue === 0 && (
						<Typography
							align="center"
							fontSize="13px"
							sx={{
								color:
									mode === "dark" ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)",
								marginTop: "4px",
							}}
						>
							vs. prev. period
						</Typography>
					)}
				</Box>
			)}
		</div>
	);
};

export default CacheWriteTokenText;
