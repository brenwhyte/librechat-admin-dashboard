"use client";

import Box from "@mui/material/Box";
import { blueGrey } from "@mui/material/colors";
import { LineChart, lineElementClasses } from "@mui/x-charts/LineChart";
import { useAtom, useAtomValue } from "jotai";
import { loadable } from "jotai/utils";
import { useEffect, useMemo, useState } from "react";
import { allModelsStatsTableChartAtom } from "@/atoms/all-models-stats-table-chart-atom";
import { dateRangeAtom } from "@/atoms/date-range-atom";
import type { StatsTableChartItem } from "../models/stats-table-chart-item";
import { generateChartData } from "../utils/generate-table-chart-data";

type Model = {
	model: string;
};

const margin = { right: 24 };

const AllModelStatsTableChart = ({ model }: Model) => {
	const [chartData, setChartData] = useState<StatsTableChartItem[]>([]);

	const timeArea = useAtomValue(dateRangeAtom);

	const loadableModelChartAtom = useMemo(
		() => loadable(allModelsStatsTableChartAtom(model)),
		[model],
	);
	const [modelChartData] = useAtom(loadableModelChartAtom);

	useEffect(() => {
		setChartData([]);
		if (
			!(modelChartData.state === "loading") &&
			modelChartData.state === "hasData"
		) {
			const data = generateChartData(timeArea, modelChartData.data);
			setChartData(data);
		}
	}, [modelChartData, timeArea]);

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
				loading={modelChartData.state === "loading"}
			/>
		</Box>
	);
};
export default AllModelStatsTableChart;
