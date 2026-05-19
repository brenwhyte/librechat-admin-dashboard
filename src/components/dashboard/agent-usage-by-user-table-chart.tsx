"use client";

import Box from "@mui/material/Box";
import { blueGrey } from "@mui/material/colors";
import { LineChart, lineElementClasses } from "@mui/x-charts/LineChart";
import { useAtom, useAtomValue } from "jotai";
import { loadable } from "jotai/utils";
import { useEffect, useMemo, useState } from "react";
import { agentUsageByUserChartAtom } from "@/atoms/agent-usage-by-user-chart-atom";
import { dateRangeAtom } from "@/atoms/date-range-atom";
import type { StatsTableChartItem } from "../models/stats-table-chart-item";
import { generateChartData } from "../utils/generate-table-chart-data";

interface Props {
    userId: string;
    agentId: string;
}

const margin = { right: 24 };

const AgentUsageByUserTableChart = ({ userId, agentId }: Props) => {
    const [chartData, setChartData] = useState<StatsTableChartItem[]>([]);

    const timeArea = useAtomValue(dateRangeAtom);
    const key = `${userId}::${agentId}`;

    const loadableChartAtom = useMemo(
        () => loadable(agentUsageByUserChartAtom(key)),
        [key],
    );
    const [chartAtomData] = useAtom(loadableChartAtom);

    useEffect(() => {
        setChartData([]);
        if (
            !(chartAtomData.state === "loading") &&
            chartAtomData.state === "hasData"
        ) {
            const data = generateChartData(timeArea, chartAtomData.data);
            setChartData(data);
        }
    }, [chartAtomData, timeArea]);

    const xLabels = chartData.map((item) => item.label);

    return (
        <Box sx={{ width: "100%", height: 300 }}>
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
                loading={chartAtomData.state === "loading"}
            />
        </Box>
    );
};

export default AgentUsageByUserTableChart;
