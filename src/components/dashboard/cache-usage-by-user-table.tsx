"use client";

import { useColorScheme } from "@mui/material";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useAtom } from "jotai";
import { loadable } from "jotai/utils";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { cacheUsageByUserAtom } from "@/atoms/cache-usage-by-user-atom";
import useTableManager from "@/hooks/useTableManager";
import type { CacheUsageByUser } from "../models/cache-usage-by-user";
import EnhancedTableHead from "./enhanced-table-head";
import EnhancedTableToolbar from "./enhanced-table-toolbar";

interface CacheByUserRow {
	name: string;
	email: string;
	inputTokens: number;
	writeTokens: number;
	readTokens: number;
	hitRate: number;
}

interface HeadCell {
	id: keyof CacheByUserRow;
	label: string;
	numeric: boolean;
}

const headCells: readonly HeadCell[] = [
	{ id: "name", label: "Name", numeric: false },
	{ id: "email", label: "Email", numeric: false },
	{ id: "inputTokens", label: "Input Tokens", numeric: true },
	{ id: "writeTokens", label: "Cache Written", numeric: true },
	{ id: "readTokens", label: "Cache Hits", numeric: true },
	{ id: "hitRate", label: "Hit Rate %", numeric: true },
];

const loadableCacheByUserAtom = loadable(cacheUsageByUserAtom);

const CacheUsageByUserTable: React.FC = () => {
	const [searchTerm, setSearchTerm] = useState("");
	const [tableData] = useAtom(loadableCacheByUserAtom);
	const [isClient, setIsClient] = useState(false);
	const { mode } = useColorScheme();

	useEffect(() => setIsClient(true), []);

	const mappedRows: CacheByUserRow[] = useMemo(() => {
		if (tableData.state === "hasData") {
			return tableData.data.map((u: CacheUsageByUser) => ({
				name: u.name || "Unknown",
				email: u.email || "Unknown",
				inputTokens: u.inputTokens ?? 0,
				writeTokens: u.writeTokens ?? 0,
				readTokens: u.readTokens ?? 0,
				hitRate: u.hitRate ?? 0,
			}));
		}
		return [];
	}, [tableData]);

	const filteredRows = useMemo(() => {
		if (!searchTerm) return mappedRows;
		const lower = searchTerm.toLowerCase();
		return mappedRows.filter(
			(r) =>
				r.name.toLowerCase().includes(lower) ||
				r.email.toLowerCase().includes(lower),
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
	} = useTableManager({ rows: filteredRows, initialOrderBy: "readTokens" });

	if (!isClient) return null;

	return (
		<Box sx={{ width: "100%" }}>
			<EnhancedTableToolbar
				tableTitle="Cache Usage by User"
				searchFieldPlaceholder="Search name or email"
				onSearchChange={setSearchTerm}
			/>
			{tableData.state === "loading" ? (
				<Box
					sx={{ display: "flex", justifyContent: "center", padding: "40px" }}
				>
					<CircularProgress />
				</Box>
			) : mappedRows.length === 0 ? (
				<Box
					sx={{ display: "flex", justifyContent: "center", padding: "40px" }}
				>
					<Typography
						sx={{
							color:
								mode === "dark" ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)",
							fontSize: "14px",
						}}
					>
						No cache usage data for selected period
					</Typography>
				</Box>
			) : (
				<>
					<TableContainer>
						<Table size="small">
							<EnhancedTableHead
								headCells={headCells}
								order={order}
								orderBy={orderBy}
								onRequestSort={handleRequestSort}
							/>
							<TableBody>
								{visibleRows.map((row, idx) => (
									<TableRow key={`${row.email}-${idx}`} hover>
										{" "}
										<TableCell /> <TableCell>{row.name}</TableCell>
										<TableCell>{row.email}</TableCell>
										<TableCell align="right">
											{row.inputTokens.toLocaleString("en-US")}
										</TableCell>
										<TableCell align="right">
											{row.writeTokens.toLocaleString("en-US")}
										</TableCell>
										<TableCell align="right">
											{row.readTokens.toLocaleString("en-US")}
										</TableCell>
										<TableCell align="right">
											{row.hitRate.toFixed(1)}%
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</TableContainer>
					<TablePagination
						rowsPerPageOptions={[10, 25, 50]}
						component="div"
						count={filteredRows.length}
						rowsPerPage={rowsPerPage}
						page={page}
						onPageChange={handleChangePage}
						onRowsPerPageChange={handleChangeRowsPerPage}
					/>
				</>
			)}
		</Box>
	);
};

export default CacheUsageByUserTable;
