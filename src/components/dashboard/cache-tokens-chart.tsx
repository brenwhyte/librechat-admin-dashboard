"use client";

import { useColorScheme } from "@mui/material";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { amber, blueGrey, teal } from "@mui/material/colors";
import Typography from "@mui/material/Typography";
import { LineChart, lineElementClasses } from "@mui/x-charts/LineChart";
import { useAtom } from "jotai";
import { loadable } from "jotai/utils";
import { useMemo } from "react";
import { cacheTokenChartAtom } from "@/atoms/cache-token-chart-atom";
import type { CacheTokenTimeSeries } from "../models/cache-token-timeseries";

const loadableCacheChartAtom = loadable(cacheTokenChartAtom);

const margin = { right: 24 };

const CacheTokensChart = () => {
	const [chartData] = useAtom(loadableCacheChartAtom);
	const { mode } = useColorScheme();

	const rows: CacheTokenTimeSeries[] = useMemo(() => {
		if (chartData.state === "hasData") return chartData.data;
		return [];
	}, [chartData]);

	const xLabels = rows.map((r) => r.day ?? r.hour ?? r.month ?? "");

	const isLoading = chartData.state === "loading";

	return (
		<Box sx={{ width: "100%", padding: "20px" }}>
			<Typography
				sx={{
					fontSize: "15px",
					fontWeight: 600,
					marginBottom: "16px",
					color:
						mode === "dark" ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.85)",
				}}
			>
				Cache Token Usage Over Time
			</Typography>
			{isLoading ? (
				<Box
					sx={{
						display: "flex",
						justifyContent: "center",
						alignItems: "center",
						height: 300,
					}}
				>
					<CircularProgress size={32} />
				</Box>
			) : rows.length === 0 ? (
				<Box
					sx={{
						display: "flex",
						justifyContent: "center",
						alignItems: "center",
						height: 300,
					}}
				>
					<Typography
						sx={{
							color:
								mode === "dark" ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)",
							fontSize: "14px",
						}}
					>
						No cache token data for selected period
					</Typography>
				</Box>
			) : (
				<LineChart
					series={[
						{
							data: rows.map((r) => r.inputTokens),
							label: "Input (regular)",
							area: true,
							stack: "total",
							showMark: false,
							color: blueGrey["300"],
						},
						{
							data: rows.map((r) => r.writeTokens),
							label: "Cache Written",
							area: true,
							stack: "total",
							showMark: false,
							color: teal["400"],
						},
						{
							data: rows.map((r) => r.readTokens),
							label: "Cache Hits",
							area: true,
							stack: "total",
							showMark: false,
							color: amber["400"],
						},
					]}
					xAxis={[{ scaleType: "point", data: xLabels }]}
					yAxis={[{ width: 65 }]}
					sx={{
						[`& .${lineElementClasses.root}`]: {
							display: "none",
						},
					}}
					key={JSON.stringify(xLabels)}
					margin={margin}
					height={300}
				/>
			)}
		</Box>
	);
};

export default CacheTokensChart;
