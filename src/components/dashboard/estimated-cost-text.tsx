"use client";

import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { Box, Link, Tooltip, useColorScheme } from "@mui/material";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { loadable } from "jotai/utils";
import { useEffect, useMemo, useState } from "react";
import { estimatedCostAtom } from "@/atoms/estimated-cost-atom";
import { useLoadableWithCache } from "@/hooks/useLoadableWithCache";

const loadableEstimatedCostAtom = loadable(estimatedCostAtom);

const TD_SYNNEX_URL =
	"https://ion.tdsynnex.com/v2c/login?accountName=innfactorygmbh-de&accountName=innfactorygmbh-de";

/**
 * Format a cost value as EUR with German locale
 */
function formatCostEur(value: number): { short: string; full: string } {
	const full = value.toLocaleString("de-DE", {
		style: "currency",
		currency: "EUR",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

	const absValue = Math.abs(value);
	let short: string;

	if (absValue >= 1_000_000) {
		short = `${(value / 1_000_000).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} Mio. €`;
	} else if (absValue >= 1_000) {
		short = `${(value / 1_000).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} Tsd. €`;
	} else {
		short = full;
	}

	return { short, full };
}

const EstimatedCostText = () => {
	const { data, showSkeleton, isRefetching } = useLoadableWithCache(
		loadableEstimatedCostAtom,
	);
	const [isClient, setIsClient] = useState(false);
	const { mode } = useColorScheme();

	useEffect(() => {
		setIsClient(true);
	}, []);

	const formattedValue = useMemo(() => {
		if (!data || data.length === 0) {
			return formatCostEur(0);
		}
		return formatCostEur(data[0].totalEstimatedCost);
	}, [data]);

	return (
		<div
			style={{
				padding: "20px",
				alignItems: "center",
				display: "flex",
				flexDirection: "column",
				height: "100%",
			}}
		>
			<Box
				sx={{
					minHeight: "48px",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					gap: 1,
				}}
			>
				<AttachMoneyIcon
					sx={{
						fontSize: "1rem",
						color:
							mode === "dark" ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.5)",
					}}
				/>
				<Typography
					align={"center"}
					sx={{
						color:
							mode === "dark" ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)",
						fontSize: "13px",
						fontWeight: 500,
						letterSpacing: "0.02em",
						textTransform: "uppercase",
						lineHeight: 1.3,
					}}
				>
					Estimated Cost
				</Typography>
			</Box>
			{!isClient || showSkeleton ? (
				<div style={{ marginTop: "12px" }}>
					<Skeleton
						variant={"text"}
						width={100}
						height={40}
						sx={{
							margin: "0 auto",
							backgroundColor:
								mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
							borderRadius: "8px",
						}}
						animation={"wave"}
					/>
					<Skeleton
						variant={"text"}
						width={80}
						height={30}
						sx={{
							margin: "0 auto",
							backgroundColor:
								mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
							borderRadius: "8px",
						}}
						animation={"wave"}
					/>
				</div>
			) : (
				<Box
					sx={{
						opacity: isRefetching ? 0.7 : 1,
						transition: "opacity 0.2s ease",
					}}
				>
					<Tooltip
						title={formattedValue.full}
						arrow
						placement="top"
						enterDelay={300}
					>
						<Typography
							variant="h5"
							marginTop="12px"
							align="center"
							sx={{
								fontWeight: 700,
								fontSize: "32px",
								letterSpacing: "-0.03em",
								background:
									mode === "dark"
										? "linear-gradient(135deg, #30d158 0%, rgba(48,209,88,0.7) 100%)"
										: "linear-gradient(135deg, #28a745 0%, rgba(40,167,69,0.8) 100%)",
								backgroundClip: "text",
								WebkitBackgroundClip: "text",
								WebkitTextFillColor: "transparent",
								cursor: "help",
							}}
						>
							{formattedValue.short}
						</Typography>
					</Tooltip>
					<Typography
						align="center"
						sx={{
							fontSize: "11px",
							marginTop: "2px",
							color:
								mode === "dark" ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)",
							fontStyle: "italic",
						}}
					>
						geschätzt (tokenValue)
					</Typography>
					<Link
						href={TD_SYNNEX_URL}
						target="_blank"
						rel="noopener noreferrer"
						sx={{
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							gap: "4px",
							marginTop: "6px",
							fontSize: "11px",
							color:
								mode === "dark" ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)",
							textDecoration: "none",
							"&:hover": {
								color: "#0071e3",
								textDecoration: "underline",
							},
						}}
					>
						Reale Kosten von Infrastruktur und Token
						<OpenInNewIcon sx={{ fontSize: "10px" }} />
					</Link>
				</Box>
			)}
		</div>
	);
};
export default EstimatedCostText;
