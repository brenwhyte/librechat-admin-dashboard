"use client";

import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import { Box, useColorScheme } from "@mui/material";
import Skeleton from "@mui/material/Skeleton";
import { useTheme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { PieChart, type PieChartProps } from "@mui/x-charts/PieChart";
import { useAtom } from "jotai";
import { loadable } from "jotai/utils";
import { useEffect, useMemo, useState } from "react";
import { costByDomainAtom } from "@/atoms/cost-by-domain-atom";
import styles from "@/components/dashboard/all-model-usage-pie-chart.module.css";
import type { CostByDomain } from "@/components/models/cost-by-domain";

// Color palette for domains
const domainColors = [
	"#0066FF", // Blue
	"#FF6B35", // Orange
	"#00C853", // Green
	"#E91E63", // Pink
	"#9C27B0", // Purple
	"#00BCD4", // Teal
	"#FFB800", // Gold
	"#795548", // Brown
	"#607D8B", // Blue Grey
	"#FF5722", // Deep Orange
	"#8BC34A", // Light Green
	"#6B5CE7", // Purple-Blue
	"#00D4FF", // Cyan
	"#F44336", // Red
];

function formatCost(value: number): string {
	return value.toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

function createPieChartData(data: CostByDomain[]) {
	return data.map((entry, index) => ({
		label: entry.domain,
		value: entry.totalCost,
		color: domainColors[index % domainColors.length],
		percentage: entry.costPercentage,
		userCount: entry.userCount,
	}));
}

const loadableCostByDomainAtom = loadable(costByDomainAtom);

const CostByDomainPieChart = () => {
	const [domainData] = useAtom(loadableCostByDomainAtom);
	const { mode } = useColorScheme();
	const { vars } = useTheme();

	const [isClient, setIsClient] = useState(false);
	useEffect(() => setIsClient(true), []);

	const chartData = useMemo(() => {
		if (domainData.state === "hasData") {
			return createPieChartData(domainData.data);
		}
		return [];
	}, [domainData]);

	const hasData = chartData.length > 0;

	const settings: PieChartProps = {
		series: [
			{
				innerRadius: 40,
				outerRadius: 110,
				data: chartData,
				highlightScope: { fade: "global", highlight: "item" },
			},
		],
		height: 300,
		hideLegend: true,
	};

	return (
		<div>
			<Typography
				align="center"
				variant="h6"
				sx={{
					fontWeight: 600,
					letterSpacing: "-0.02em",
					background:
						mode === "dark"
							? "linear-gradient(135deg, #f5f5f7 0%, rgba(255,255,255,0.7) 100%)"
							: "linear-gradient(135deg, #1d1d1f 0%, rgba(0,0,0,0.7) 100%)",
					backgroundClip: "text",
					WebkitBackgroundClip: "text",
					WebkitTextFillColor: "transparent",
				}}
			>
				Estimated Cost per Domain
			</Typography>
			<div className={styles.smallDisplayFix}>
				{domainData.state === "loading" || !isClient ? (
					<>
						<div style={{ padding: "35px", marginTop: "20px" }}>
							<Skeleton
								variant="circular"
								width={230}
								height={230}
								animation="wave"
								sx={{
									background:
										mode === "dark"
											? "rgba(255,255,255,0.06)"
											: "rgba(0,0,0,0.06)",
								}}
							/>
						</div>
						<div
							style={{
								display: "flex",
								gap: "1rem",
								flexDirection: "column",
								justifyContent: "center",
								padding: "5px",
							}}
						>
							{[...Array(3)].map((_, i) => (
								<Skeleton
									key={i}
									variant="rectangular"
									width={120}
									height={20}
									animation="wave"
								/>
							))}
						</div>
					</>
				) : domainData.state === "hasError" ? (
					<Box
						sx={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							justifyContent: "center",
							padding: "40px",
							minHeight: "280px",
						}}
					>
						<Typography color={"error"} sx={{ opacity: 0.8 }}>
							{String(domainData.error)}
						</Typography>
					</Box>
				) : domainData.state === "hasData" && !hasData ? (
					<Box
						sx={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							justifyContent: "center",
							padding: "40px",
							minHeight: "280px",
						}}
					>
						<Box
							sx={{
								width: 120,
								height: 120,
								borderRadius: "50%",
								background:
									mode === "dark"
										? "rgba(255,255,255,0.04)"
										: "rgba(0,0,0,0.04)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								marginBottom: "16px",
							}}
						>
							<AttachMoneyIcon sx={{ fontSize: "48px", opacity: 0.3 }} />
						</Box>
						<Typography
							sx={{
								color: vars?.palette.text.secondary,
								fontSize: "14px",
								textAlign: "center",
							}}
						>
							Keine Kostendaten für den gewählten Zeitraum
						</Typography>
					</Box>
				) : domainData.state === "hasData" ? (
					<>
						<div style={{ marginTop: "20px" }}>
							<PieChart {...settings} width={300} height={300} />
						</div>
						<div
							style={{
								display: "flex",
								gap: "12px",
								flexDirection: "column",
								justifyContent: "center",
								padding: "8px",
							}}
						>
							{chartData.map((item) => (
								<div
									key={item.label}
									style={{
										display: "flex",
										alignItems: "center",
										padding: "8px 12px",
										borderRadius: "10px",
										background:
											mode === "dark"
												? "rgba(255,255,255,0.04)"
												: "rgba(0,0,0,0.03)",
										transition: "all 0.2s ease",
									}}
								>
									<div
										style={{
											borderRadius: "6px",
											width: 14,
											height: 14,
											backgroundColor: item.color,
											marginRight: 10,
											flexShrink: 0,
											boxShadow: `0 2px 8px ${item.color}40`,
										}}
									/>
									<div style={{ minWidth: 0 }}>
										<Typography
											sx={{
												fontSize: "14px",
												fontWeight: 500,
												whiteSpace: "nowrap",
												overflow: "hidden",
												textOverflow: "ellipsis",
											}}
										>
											{item.label}
										</Typography>
										<Typography
											sx={{
												fontSize: "12px",
												color:
													mode === "dark"
														? "rgba(255,255,255,0.5)"
														: "rgba(0,0,0,0.5)",
											}}
										>
											{formatCost(item.value)} € ({item.percentage.toFixed(1)}
											%) · {item.userCount}{" "}
											{item.userCount === 1 ? "User" : "Users"}
										</Typography>
									</div>
								</div>
							))}
						</div>
					</>
				) : null}
			</div>
		</div>
	);
};

export default CostByDomainPieChart;
