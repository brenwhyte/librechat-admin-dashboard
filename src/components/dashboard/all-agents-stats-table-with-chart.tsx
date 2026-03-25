"use client";

import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import { useAtom } from "jotai";
import { loadable } from "jotai/utils";
import React, { useEffect, useMemo, useState } from "react";
import { allAgentsStatsTableAtom } from "@/atoms/all-agents-stats-table-atom";
import useTableManager from "@/hooks/useTableManager";
import type { AllAgentsStatsTable } from "../models/all-agents-stats-table";
import AllAgentsStatsTableChart from "./all-agents-stats-table-chart";
import EnhancedTableHead from "./enhanced-table-head";
import EnhancedTableToolbar from "./enhanced-table-toolbar";

// Types
interface AllAgentsStatsTableRow {
	agentName: string;
	model: string;
	totalRequests: number;
	totalTokens: number;
	totalInputToken: number;
	totalOutputToken: number;
}

interface HeadCell {
	id: keyof AllAgentsStatsTableRow;
	label: string;
	numeric: boolean;
}

const headCells: readonly HeadCell[] = [
	{ id: "agentName", label: "Agent", numeric: false },
	{ id: "model", label: "Model", numeric: false },
	{ id: "totalRequests", label: "Total Requests", numeric: true },
	{ id: "totalTokens", label: "Total Tokens", numeric: true },
	{ id: "totalInputToken", label: "Input Tokens", numeric: true },
	{ id: "totalOutputToken", label: "Output Tokens", numeric: true },
];

// Expandable row renderer
function Row({ row }: { row: AllAgentsStatsTableRow }) {
	const [open, setOpen] = useState(false);

	return (
		<React.Fragment>
			<TableRow sx={{ "& > *": { borderBottom: "unset" } }}>
				<TableCell>
					<IconButton
						aria-label="expand row"
						size="small"
						onClick={() => setOpen(!open)}
					>
						{open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
					</IconButton>
				</TableCell>
				<TableCell>{row.agentName}</TableCell>
				<TableCell>{row.model}</TableCell>
				<TableCell align="right">
					{row.totalRequests?.toLocaleString("de-DE")}
				</TableCell>
				<TableCell align="right">
					{row.totalTokens?.toLocaleString("de-DE")}
				</TableCell>
				<TableCell align="right">
					{row.totalInputToken?.toLocaleString("de-DE")}
				</TableCell>
				<TableCell align="right">
					{row.totalOutputToken?.toLocaleString("de-DE")}
				</TableCell>
			</TableRow>
			<TableRow>
				<TableCell style={{ padding: 0 }} colSpan={9}>
					<Collapse in={open} timeout="auto" unmountOnExit>
						<Box sx={{ margin: "10px" }}>
							<AllAgentsStatsTableChart agent={row.agentName} />
						</Box>
					</Collapse>
				</TableCell>
			</TableRow>
		</React.Fragment>
	);
}

// Module-scope loadable atom (avoid re-creation on every render)
const loadableAllAgentsStatsAtom = loadable(allAgentsStatsTableAtom);

const AllAgentsStatsTableWithChart: React.FC = () => {
	const [searchTerm, setSearchTerm] = useState("");

	// Data from state/atom
	const [tableData] = useAtom(loadableAllAgentsStatsAtom);

	// Hydration fix https://nextjs.org/docs/messages/react-hydration-error
	const [isClient, setIsClient] = useState(false);
	useEffect(() => setIsClient(true), []);

	// Raw data mapping
	const mappedRows: AllAgentsStatsTableRow[] = useMemo(() => {
		if (tableData.state === "hasData") {
			return tableData.data.map((agent: AllAgentsStatsTable) => ({
				agentName: agent.agentName,
				model: agent.model,
				totalRequests: agent.requests ?? 0,
				totalTokens:
					(agent.totalInputToken ?? 0) + (agent.totalOutputToken ?? 0),
				totalInputToken: agent.totalInputToken ?? 0,
				totalOutputToken: agent.totalOutputToken ?? 0,
			}));
		}
		return [];
	}, [tableData]);

	// Search filter
	const filteredRows = useMemo(() => {
		if (!searchTerm) return mappedRows;
		const lowerTerm = searchTerm.toLowerCase();
		return mappedRows.filter(
			(row) =>
				row.agentName.toLowerCase().includes(lowerTerm) ||
				row.model.toLowerCase().includes(lowerTerm),
		);
	}, [mappedRows, searchTerm]);

	const {
		order,
		orderBy,
		page,
		rowsPerPage,
		visibleRows,
		handleRequestSort,
		handleChangePage,
		handleChangeRowsPerPage,
	} = useTableManager({
		rows: filteredRows,
		initialOrderBy: "totalRequests",
	});

	return (
		<Box sx={{ width: "100%" }}>
			<EnhancedTableToolbar
				searchFieldPlaceholder="Search agent or model"
				tableTitle="AI Agent Statisics"
				onSearchChange={setSearchTerm}
			/>
			<TableContainer
				sx={{
					minHeight: 200,
					maxHeight: 550,
				}}
			>
				<Table
					stickyHeader
					sx={{ minWidth: 900 }}
					aria-label="AI Agents Stats Table"
				>
					<EnhancedTableHead
						order={order}
						orderBy={orderBy}
						headCells={headCells}
						onRequestSort={handleRequestSort}
					/>
					<TableBody>
						{!isClient || tableData.state === "loading" ? (
							<TableRow>
								<TableCell colSpan={headCells.length + 1} align="center">
									<CircularProgress size={25} />
								</TableCell>
							</TableRow>
						) : tableData.state === "hasError" ? (
							<TableRow>
								<TableCell
									colSpan={headCells.length + 1}
									align="center"
									sx={{ color: "error.main" }}
								>
									Error loading data
								</TableCell>
							</TableRow>
						) : filteredRows.length === 0 && searchTerm.length > 0 ? (
							<TableRow>
								<TableCell colSpan={headCells.length + 1} align="center">
									No matching agent or model
								</TableCell>
							</TableRow>
						) : filteredRows.length === 0 ? (
							<TableRow>
								<TableCell colSpan={headCells.length + 1} align="center">
									No data for this time range
								</TableCell>
							</TableRow>
						) : (
							visibleRows.map((row) => (
								<Row key={`${row.agentName}-${row.model}`} row={row} />
							))
						)}
					</TableBody>
				</Table>
			</TableContainer>
			{isClient && filteredRows.length > 0 && (
				<TablePagination
					rowsPerPageOptions={[5, 10, 25]}
					component="div"
					count={filteredRows.length}
					rowsPerPage={rowsPerPage}
					page={page}
					onPageChange={handleChangePage}
					onRowsPerPageChange={handleChangeRowsPerPage}
				/>
			)}
		</Box>
	);
};

export default AllAgentsStatsTableWithChart;
