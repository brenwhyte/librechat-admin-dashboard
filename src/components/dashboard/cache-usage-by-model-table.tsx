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
import { cacheUsageByModelAtom } from "@/atoms/cache-usage-by-model-atom";
import useTableManager from "@/hooks/useTableManager";
import type { CacheUsageByModel } from "../models/cache-usage-by-model";
import EnhancedTableHead from "./enhanced-table-head";
import EnhancedTableToolbar from "./enhanced-table-toolbar";

interface CacheByModelRow {
	model: string;
	endpoint: string;
	inputTokens: number;
	writeTokens: number;
	readTokens: number;
	hitRate: number;
}

interface HeadCell {
	id: keyof CacheByModelRow;
	label: string;
	numeric: boolean;
}

const headCells: readonly HeadCell[] = [
	{ id: "model", label: "Model", numeric: false },
	{ id: "endpoint", label: "Endpoint", numeric: false },
	{ id: "inputTokens", label: "Input Tokens", numeric: true },
	{ id: "writeTokens", label: "Cache Written", numeric: true },
	{ id: "readTokens", label: "Cache Hits", numeric: true },
	{ id: "hitRate", label: "Hit Rate %", numeric: true },
];

const loadableCacheByModelAtom = loadable(cacheUsageByModelAtom);

const CacheUsageByModelTable: React.FC = () => {
	const [searchTerm, setSearchTerm] = useState("");
	const [tableData] = useAtom(loadableCacheByModelAtom);
	const [isClient, setIsClient] = useState(false);
	const { mode } = useColorScheme();

	useEffect(() => setIsClient(true), []);

	const mappedRows: CacheByModelRow[] = useMemo(() => {
		if (tableData.state === "hasData") {
			return tableData.data.map((m: CacheUsageByModel) => ({
				model: m.model || "unknown",
				endpoint: m.endpoint || "unknown",
				inputTokens: m.inputTokens ?? 0,
				writeTokens: m.writeTokens ?? 0,
				readTokens: m.readTokens ?? 0,
				hitRate: m.hitRate ?? 0,
			}));
		}
		return [];
	}, [tableData]);

	const filteredRows = useMemo(() => {
		if (!searchTerm) return mappedRows;
		const lower = searchTerm.toLowerCase();
		return mappedRows.filter(
			(r) =>
				r.model.toLowerCase().includes(lower) ||
				r.endpoint.toLowerCase().includes(lower),
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
				tableTitle="Cache Usage by Model"
				searchFieldPlaceholder="Search model or endpoint"
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
									<TableRow key={`${row.model}-${row.endpoint}-${idx}`} hover>
										{" "}
										<TableCell /> <TableCell>{row.model}</TableCell>
										<TableCell>{row.endpoint}</TableCell>
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

export default CacheUsageByModelTable;
