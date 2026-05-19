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
import { agentUsageByUserAtom } from "@/atoms/agent-usage-by-user-atom";
import useTableManager from "@/hooks/useTableManager";
import type { AgentUsageByUser } from "../models/agent-usage-by-user";
import AgentUsageByUserTableChart from "./agent-usage-by-user-table-chart";
import EnhancedTableHead from "./enhanced-table-head";
import EnhancedTableToolbar from "./enhanced-table-toolbar";

interface AgentUsageByUserRow {
	userId: string;
	agentId: string;
	name: string;
	email: string;
	agentName: string;
	totalRequests: number;
	totalTokens: number;
	totalInputToken: number;
	totalOutputToken: number;
}

type SortableKey = Omit<AgentUsageByUserRow, "userId" | "agentId">;

interface HeadCell {
	id: keyof SortableKey;
	label: string;
	numeric: boolean;
}

const headCells: readonly HeadCell[] = [
	{ id: "name", label: "Name", numeric: false },
	{ id: "email", label: "Email", numeric: false },
	{ id: "agentName", label: "Agent", numeric: false },
	{ id: "totalRequests", label: "Requests", numeric: true },
	{ id: "totalTokens", label: "Total Tokens", numeric: true },
	{ id: "totalInputToken", label: "Input Tokens", numeric: true },
	{ id: "totalOutputToken", label: "Output Tokens", numeric: true },
];

function Row({ row }: { row: AgentUsageByUserRow }) {
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
				<TableCell>{row.name}</TableCell>
				<TableCell>{row.email}</TableCell>
				<TableCell>{row.agentName}</TableCell>
				<TableCell align="right">
					{row.totalRequests?.toLocaleString("en-US")}
				</TableCell>
				<TableCell align="right">
					{row.totalTokens?.toLocaleString("en-US")}
				</TableCell>
				<TableCell align="right">
					{row.totalInputToken?.toLocaleString("en-US")}
				</TableCell>
				<TableCell align="right">
					{row.totalOutputToken?.toLocaleString("en-US")}
				</TableCell>
			</TableRow>
			<TableRow>
				<TableCell style={{ padding: 0 }} colSpan={9}>
					<Collapse in={open} timeout="auto" unmountOnExit>
						<Box sx={{ margin: "10px" }}>
							<AgentUsageByUserTableChart
								userId={row.userId}
								agentId={row.agentId}
							/>
						</Box>
					</Collapse>
				</TableCell>
			</TableRow>
		</React.Fragment>
	);
}

const loadableAgentUsageByUserAtom = loadable(agentUsageByUserAtom);

const AgentUsageByUserTableWithChart: React.FC = () => {
	const [searchTerm, setSearchTerm] = useState("");
	const [tableData] = useAtom(loadableAgentUsageByUserAtom);

	const [isClient, setIsClient] = useState(false);
	useEffect(() => setIsClient(true), []);

	const mappedRows: AgentUsageByUserRow[] = useMemo(() => {
		if (tableData.state === "hasData") {
			return tableData.data.map((entry: AgentUsageByUser) => ({
				userId: entry.userId,
				agentId: entry.agentId,
				name: entry.name,
				email: entry.email,
				agentName: entry.agentName,
				totalRequests: entry.requests ?? 0,
				totalTokens:
					(entry.totalInputToken ?? 0) + (entry.totalOutputToken ?? 0),
				totalInputToken: entry.totalInputToken ?? 0,
				totalOutputToken: entry.totalOutputToken ?? 0,
			}));
		}
		return [];
	}, [tableData]);

	const filteredRows = useMemo(() => {
		if (!searchTerm) return mappedRows;
		const lowerTerm = searchTerm.toLowerCase();
		return mappedRows.filter(
			(row) =>
				row.name.toLowerCase().includes(lowerTerm) ||
				row.email.toLowerCase().includes(lowerTerm) ||
				row.agentName.toLowerCase().includes(lowerTerm),
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
				searchFieldPlaceholder="Search user or agent"
				tableTitle="Agent Usage by User"
				onSearchChange={setSearchTerm}
			/>
			<TableContainer sx={{ minHeight: 200, maxHeight: 550 }}>
				<Table
					stickyHeader
					sx={{ minWidth: 900 }}
					aria-label="Agent Usage by User Table"
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
									No matching user or agent
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
								<Row key={`${row.userId}::${row.agentId}`} row={row} />
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

export default AgentUsageByUserTableWithChart;
