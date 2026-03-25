"use client";

import DownloadIcon from "@mui/icons-material/Download";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import { useColorScheme } from "@mui/material/styles";
import Tooltip from "@mui/material/Tooltip";
import { format } from "date-fns";
import { useAtomValue } from "jotai";
import { loadable } from "jotai/utils";
import { useCallback, useState } from "react";
import { allAgentsStatsTableAtom } from "@/atoms/all-agents-stats-table-atom";
import { allModelsStatsTableAtom } from "@/atoms/all-models-stats-table-atom";
import { dateRangeAtom } from "@/atoms/date-range-atom";
import { inputOuputTokenAtom } from "@/atoms/input-output-token-atom";
import { mcpToolStatsTableAtom } from "@/atoms/mcp-tool-stats-table-atom";

interface ExportData {
	dateRange: { startDate: Date | null; endDate: Date | null };
	tokens: { currentInputToken: number; currentOutputToken: number }[];
	models: {
		model: string;
		endpoint: string;
		totalInputToken: number;
		totalOutputToken: number;
		requests: number;
	}[];
	agents: {
		agentName: string;
		model: string;
		totalInputToken: number;
		totalOutputToken: number;
		requests: number;
	}[];
	tools: { toolName: string; serverName: string; callCount: number }[];
}

const exportToExcel = async (data: ExportData) => {
	const ExcelJS = await import("exceljs");
	const wb = new ExcelJS.Workbook();

	// Sheet 1: Executive Summary
	const dateRangeStr =
		data.dateRange.startDate && data.dateRange.endDate
			? `${format(data.dateRange.startDate, "dd.MM.yyyy")} - ${format(data.dateRange.endDate, "dd.MM.yyyy")}`
			: "All Time";

	const tokens = data.tokens[0] || {
		currentInputToken: 0,
		currentOutputToken: 0,
	};
	const totalModelsRequests = data.models.reduce(
		(sum, m) => sum + (m.requests || 0),
		0,
	);

	const summarySheet = wb.addWorksheet("Summary");
	const summaryData = [
		["AI Metrics Dashboard - Executive Summary"],
		[""],
		["Date Range", dateRangeStr],
		["Export Date", format(new Date(), "dd.MM.yyyy HH:mm")],
		[""],
		["Key Metrics"],
		["Total Input Tokens", tokens.currentInputToken],
		["Total Output Tokens", tokens.currentOutputToken],
		["Total Tokens", tokens.currentInputToken + tokens.currentOutputToken],
		["Total Requests", totalModelsRequests],
		[""],
		["AI Models", data.models.length],
		["AI Agents", data.agents.length],
		["MCP Tools Used", data.tools.length],
	];
	summaryData.forEach((row) => {
		summarySheet.addRow(row);
	});
	summarySheet.getColumn(1).width = 25;
	summarySheet.getColumn(2).width = 30;

	// Sheet 2: AI Models
	if (data.models.length > 0) {
		const modelsSheet = wb.addWorksheet("AI Models");
		modelsSheet.addRow([
			"Provider",
			"Model",
			"Total Requests",
			"Input Tokens",
			"Output Tokens",
			"Total Tokens",
		]);
		data.models.forEach((m) => {
			modelsSheet.addRow([
				m.endpoint,
				m.model,
				m.requests,
				m.totalInputToken,
				m.totalOutputToken,
				m.totalInputToken + m.totalOutputToken,
			]);
		});
		modelsSheet.getColumn(1).width = 15;
		modelsSheet.getColumn(2).width = 25;
		modelsSheet.getColumn(3).width = 15;
		modelsSheet.getColumn(4).width = 15;
		modelsSheet.getColumn(5).width = 15;
		modelsSheet.getColumn(6).width = 15;
	}

	// Sheet 3: AI Agents
	if (data.agents.length > 0) {
		const agentsSheet = wb.addWorksheet("AI Agents");
		agentsSheet.addRow([
			"Agent Name",
			"Model",
			"Total Requests",
			"Input Tokens",
			"Output Tokens",
			"Total Tokens",
		]);
		data.agents.forEach((a) => {
			agentsSheet.addRow([
				a.agentName,
				a.model,
				a.requests,
				a.totalInputToken,
				a.totalOutputToken,
				a.totalInputToken + a.totalOutputToken,
			]);
		});
		agentsSheet.getColumn(1).width = 25;
		agentsSheet.getColumn(2).width = 25;
		agentsSheet.getColumn(3).width = 15;
		agentsSheet.getColumn(4).width = 15;
		agentsSheet.getColumn(5).width = 15;
		agentsSheet.getColumn(6).width = 15;
	}

	// Sheet 4: MCP Tools
	if (data.tools.length > 0) {
		const toolsSheet = wb.addWorksheet("MCP Tools");
		toolsSheet.addRow(["Tool Name", "Server Name", "Call Count"]);
		data.tools.forEach((t) => {
			toolsSheet.addRow([t.toolName, t.serverName, t.callCount]);
		});
		toolsSheet.getColumn(1).width = 30;
		toolsSheet.getColumn(2).width = 20;
		toolsSheet.getColumn(3).width = 15;
	}

	// Generate and download file
	const buffer = await wb.xlsx.writeBuffer();
	const blob = new Blob([buffer], {
		type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `dashboard-export-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
	a.click();
	URL.revokeObjectURL(url);
};

// Module-scope loadable atoms (avoid re-creation on every render)
const loadableTokens = loadable(inputOuputTokenAtom);
const loadableModels = loadable(allModelsStatsTableAtom);
const loadableAgents = loadable(allAgentsStatsTableAtom);
const loadableTools = loadable(mcpToolStatsTableAtom);

const ExportButton = () => {
	const { mode } = useColorScheme();
	const [isExporting, setIsExporting] = useState(false);

	const dateRange = useAtomValue(dateRangeAtom);

	const tokensData = useAtomValue(loadableTokens);
	const modelsData = useAtomValue(loadableModels);
	const agentsData = useAtomValue(loadableAgents);
	const toolsData = useAtomValue(loadableTools);

	const handleExcelExport = useCallback(async () => {
		setIsExporting(true);
		try {
			const exportData: ExportData = {
				dateRange,
				tokens: tokensData.state === "hasData" ? tokensData.data : [],
				models: modelsData.state === "hasData" ? modelsData.data : [],
				agents: agentsData.state === "hasData" ? agentsData.data : [],
				tools: toolsData.state === "hasData" ? toolsData.data : [],
			};
			await exportToExcel(exportData);
		} catch (error) {
			console.error("Excel export failed:", error);
		} finally {
			setIsExporting(false);
		}
	}, [dateRange, tokensData, modelsData, agentsData, toolsData]);

	return (
		<Tooltip title="Export as Excel">
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					borderRadius: "8px",
					"&:hover": {
						background:
							mode === "dark"
								? "rgba(255, 255, 255, 0.12)"
								: "rgba(0, 0, 0, 0.08)",
					},
				}}
			>
				<IconButton
					onClick={handleExcelExport}
					size="small"
					disabled={isExporting}
					sx={{
						color: mode === "dark" ? "#f5f5f7" : "#1d1d1f",
						padding: "8px",
					}}
				>
					{isExporting ? (
						<CircularProgress size={20} color="inherit" />
					) : (
						<DownloadIcon fontSize="small" />
					)}
				</IconButton>
			</Box>
		</Tooltip>
	);
};

export default ExportButton;
