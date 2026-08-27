"use client";

import { Box, useColorScheme } from "@mui/material";
import Skeleton from "@mui/material/Skeleton";
import { useTheme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import {
	PieChart,
	type PieChartProps,
	pieArcClasses,
	pieClasses,
} from "@mui/x-charts/PieChart";
import { useAtom } from "jotai";
import { loadable } from "jotai/utils";
import { useEffect, useMemo, useState } from "react";
import { providerWithModelUsageAtom } from "@/atoms/provider-with-model-usage-atom";
import { widgetRetryAtoms } from "@/atoms/widget-retry-atoms";
import styles from "@/components/dashboard/all-model-usage-pie-chart.module.css";
import type { ProviderWithModelUsage } from "@/components/models/provider-with-model-usage";
import WidgetRetryButton from "./widget-retry-button";

type ProviderName = "azureOpenAI" | "anthropic" | "stackit";

type ModelNameMap = {
	azureOpenAI: "gpt-5-nano" | "gpt-4o" | "gpt-4o-mini";
	anthropic: "claude-sonnet-4" | "claude-3-7-sonnet";
	stackit: "neuralmagic" | "google-gemma";
};

type ColorMap = {
	[P in ProviderName]: {
		provider: string;
		models: Record<ModelNameMap[P], string>;
	};
};

// High-contrast, distinctly different color palette for each provider and model
const colorMap: ColorMap = {
	azureOpenAI: {
		provider: "#0066FF", // Vibrant Blue
		models: {
			"gpt-5-nano": "#00D4FF", // Cyan
			"gpt-4o": "#0066FF", // Blue
			"gpt-4o-mini": "#6B5CE7", // Purple-Blue
		},
	},
	anthropic: {
		provider: "#FF6B35", // Orange
		models: {
			"claude-sonnet-4": "#FF6B35", // Orange
			"claude-3-7-sonnet": "#FFB800", // Gold/Yellow
		},
	},
	stackit: {
		provider: "#00C853", // Green
		models: {
			neuralmagic: "#00C853", // Green
			"google-gemma": "#E91E63", // Pink/Magenta
		},
	},
};

// Fallback colors for unknown providers/models
const fallbackColors = [
	"#9C27B0", // Deep Purple
	"#00BCD4", // Teal
	"#795548", // Brown
	"#607D8B", // Blue Grey
	"#FF5722", // Deep Orange
	"#8BC34A", // Light Green
];

let fallbackColorIndex = 0;
const getFallbackColor = (): string => {
	const color = fallbackColors[fallbackColorIndex % fallbackColors.length];
	fallbackColorIndex++;
	return color;
};

function createPieChartDataTest(data: ProviderWithModelUsage[]) {
	const error: string[] = [];
	fallbackColorIndex = 0; // Reset fallback index for each render

	const innerData = data.map((providerEntry) => {
		const providerColor = colorMap[providerEntry._id as ProviderName]?.provider;
		if (!providerColor) {
			error.push(`Unknown provider: '${providerEntry._id}'`);
		}
		return {
			label: providerEntry._id,
			value: providerEntry.totalTokenCount,
			color: providerColor || getFallbackColor(),
		};
	});
	const outerData = data.flatMap((providerEntry) => {
		const modelsMap = colorMap[providerEntry._id as ProviderName]?.models;
		return providerEntry.models.map((model) => {
			const modelColor = modelsMap?.[model.name as keyof typeof modelsMap];
			if (!modelColor) {
				error.push(
					`Unknown model: '${model.name}' for provider '${providerEntry._id}'`,
				);
			}
			const label =
				providerEntry._id === "agents" && model.agentName
					? `${model.agentName}`
					: model.name;

			return {
				label,
				value: model.tokenCount,
				color: modelColor || getFallbackColor(),
			};
		});
	});
	return { innerData, outerData, error };
}

const loadableAtom = loadable(providerWithModelUsageAtom);

const AllModelUsagePieChart = () => {
	const [providerData] = useAtom(loadableAtom);
	const { mode } = useColorScheme();
	const { vars } = useTheme();

	const [isClient, setIsClient] = useState(false);
	useEffect(() => setIsClient(true), []);

	const chartData = useMemo(() => {
		if (providerData.state === "hasData") {
			return createPieChartDataTest(providerData.data);
		} else {
			return {
				innerData: [],
				outerData: [],
				errors: [],
			};
		}
	}, [providerData]);

	const hasData = chartData.innerData.length > 0;

	const settings: PieChartProps = {
		series: [
			{
				innerRadius: 0,
				outerRadius: 70,
				data: chartData.innerData,
				highlightScope: { fade: "global", highlight: "item" },
			},
			{
				id: "outer",
				innerRadius: 90,
				outerRadius: 110,
				data: chartData.outerData,
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
				Token Usage per Model
			</Typography>
			<div className={styles.smallDisplayFix}>
				{providerData.state === "loading" || !isClient ? (
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
				) : providerData.state === "hasError" ? (
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
							{String(providerData.error)}
						</Typography>
						<WidgetRetryButton
							retryAtom={widgetRetryAtoms.providerWithModelUsage}
						/>
					</Box>
				) : providerData.state === "hasData" && !hasData ? (
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
							<Typography sx={{ fontSize: "48px", opacity: 0.3 }}>
								📊
							</Typography>
						</Box>
						<Typography
							sx={{
								color: vars?.palette.text.secondary,
								fontSize: "14px",
								textAlign: "center",
							}}
						>
							Keine Token-Daten für den gewählten Zeitraum
						</Typography>
					</Box>
				) : providerData.state === "hasData" ? (
					<>
						<div style={{ marginTop: "20px" }}>
							<PieChart
								{...settings}
								width={300}
								height={300}
								sx={{
									[`.${pieClasses.series}[data-series="outer"] .${pieArcClasses.root}`]:
										{
											opacity: 0.7,
										},
								}}
							/>
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
							{chartData.innerData.map((item) => (
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
											boxShadow: `0 2px 8px ${item.color}40`,
										}}
									/>
									<Typography sx={{ fontSize: "14px", fontWeight: 500 }}>
										{item.label}
									</Typography>
								</div>
							))}
						</div>
					</>
				) : null}
			</div>
		</div>
	);
};

export default AllModelUsagePieChart;
