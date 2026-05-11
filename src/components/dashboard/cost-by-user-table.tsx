"use client";

import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import { useAtom } from "jotai";
import { loadable } from "jotai/utils";
import React, { useEffect, useMemo, useState } from "react";
import { costByUserAtom } from "@/atoms/cost-by-user-atom";
import useTableManager from "@/hooks/useTableManager";
import type { CostByUser } from "../models/cost-by-user";
import EnhancedTableHead from "./enhanced-table-head";
import EnhancedTableToolbar from "./enhanced-table-toolbar";

interface CostByUserRow {
	name: string;
	email: string;
	domain: string;
	totalCost: number;
	totalTokens: number;
	transactionCount: number;
	costPercentage: number;
}

interface HeadCell {
	id: keyof CostByUserRow;
	label: string;
	numeric: boolean;
}

const headCells: readonly HeadCell[] = [
	{ id: "name", label: "Name", numeric: false },
	{ id: "email", label: "Email", numeric: false },
	{ id: "domain", label: "Domain", numeric: false },
	{ id: "totalCost", label: "Est. Cost (€)", numeric: true },
	{ id: "totalTokens", label: "Tokens", numeric: true },
	{ id: "transactionCount", label: "Transactions", numeric: true },
	{ id: "costPercentage", label: "Cost %", numeric: true },
];

function formatCost(value: number): string {
	return value.toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

const loadableCostByUserAtom = loadable(costByUserAtom);

const CostByUserTable: React.FC = () => {
	const [searchTerm, setSearchTerm] = useState("");
	const [tableData] = useAtom(loadableCostByUserAtom);

	const [isClient, setIsClient] = useState(false);
	useEffect(() => setIsClient(true), []);

	const mappedRows: CostByUserRow[] = useMemo(() => {
		if (tableData.state === "hasData") {
			return tableData.data.map((user: CostByUser) => ({
				name: user.name || "Unknown",
				email: user.email || "Unknown",
				domain: user.domain || "Unknown",
				totalCost: user.totalCost ?? 0,
				totalTokens: user.totalTokens ?? 0,
				transactionCount: user.transactionCount ?? 0,
				costPercentage: user.costPercentage ?? 0,
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
				row.domain.toLowerCase().includes(lowerTerm),
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
		initialOrderBy: "totalCost",
	});

	return (
		<Box sx={{ width: "100%" }}>
			<EnhancedTableToolbar
				searchFieldPlaceholder="Search name, email, or domain"
				tableTitle="Estimated Cost by User"
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
					aria-label="Cost by User Table"
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
									No matching user
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
								<TableRow key={row.email} hover>
									<TableCell />
									<TableCell>{row.name}</TableCell>
									<TableCell>{row.email}</TableCell>
									<TableCell>{row.domain}</TableCell>
									<TableCell align="right">
										{formatCost(row.totalCost)} €
									</TableCell>
									<TableCell align="right">
										{row.totalTokens.toLocaleString("en-US")}
									</TableCell>
									<TableCell align="right">
										{row.transactionCount.toLocaleString("en-US")}
									</TableCell>
									<TableCell align="right">
										{row.costPercentage.toLocaleString("en-US", {
											minimumFractionDigits: 1,
											maximumFractionDigits: 1,
										})}
										%
									</TableCell>
								</TableRow>
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

export default CostByUserTable;
