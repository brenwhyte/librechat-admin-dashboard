"use client";

import Box from "@mui/material/Box";
import { blueGrey } from "@mui/material/colors";
import { LineChart, lineElementClasses } from "@mui/x-charts/LineChart";
import { useAtom, useAtomValue } from "jotai";
import { loadable } from "jotai/utils";
import { useEffect, useMemo, useState } from "react";
import { allAgentsStatsTableChartAtom } from "@/atoms/all-agents-stats-table-chart.atom";
import { dateRangeAtom } from "@/atoms/date-range-atom";
import type { StatsTableChartItem } from "../models/stats-table-chart-item";
import { generateChartData } from "../utils/generate-table-chart-data";

type Agent = {
	agent: string;
};

const margin = { right: 24 };

const AllAgentsStatsTableChart = ({ agent }: Agent) => {
	const [chartData, setChartData] = useState<StatsTableChartItem[]>([]);

	const timeArea = useAtomValue(dateRangeAtom);

	const loadableAgentChartAtom = useMemo(
		() => loadable(allAgentsStatsTableChartAtom(agent)),
		[agent],
	);
	const [agentChartData] = useAtom(loadableAgentChartAtom);

	useEffect(() => {
		setChartData([]);
		if (
			!(agentChartData.state === "loading") &&
			agentChartData.state === "hasData"
		) {
			const data = generateChartData(timeArea, agentChartData.data);
			setChartData(data);
		}
	}, [agentChartData, timeArea]);

	const xLabels = chartData.map((item) => item.label);

	return (
		<Box
			sx={{
				width: "100%",
				height: 300,
			}}
		>
			<LineChart
				series={[
					{
						data: chartData.map((item) => item.totalInputToken),
						label: "InputToken",
						area: true,
						stack: "total",
						showMark: false,
						color: blueGrey["200"],
					},
					{
						data: chartData.map((item) => item.totalOutputToken),
						label: "OutputToken",
						area: true,
						stack: "total",
						showMark: false,
						color: blueGrey["400"],
					},
					{
						data: chartData.map((item) => item.requests),
						label: "Requests",
						area: true,
						stack: "total",
						showMark: false,
						color: blueGrey["700"],
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
				loading={agentChartData.state === "loading"}
			/>
		</Box>
	);
};
export default AllAgentsStatsTableChart;
