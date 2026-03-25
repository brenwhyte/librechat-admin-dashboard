"use client";

import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import Skeleton from "@mui/material/Skeleton";
import { useTheme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { useAtom } from "jotai";
import { loadable } from "jotai/utils";
import { useEffect, useState } from "react";
import { tokensPerMessageAtom } from "@/atoms/tokens-per-message-atom";
import type { AvgTokensPerMessage } from "@/components/models/avg-tokens-per-message";

function getTotalTokens(totalTokenData: AvgTokensPerMessage[]) {
	const first = totalTokenData[0];

	const totalTokenCount = first.totalTokenCount ?? 0;
	const prevTotalTokenCount = first.prevTotalTokenCount;

	const tokenDiff = totalTokenCount - prevTotalTokenCount;
	const requestDiffPercentage = (tokenDiff / prevTotalTokenCount) * 100;
	const roundedDiffPercentage =
		Math.round(requestDiffPercentage * 10 ** 2) / 10 ** 2;

	return { totalTokenCount, tokenDiff, roundedDiffPercentage };
}

const loadableTokenAtom = loadable(tokensPerMessageAtom);

const TotalTokenText = () => {
	const [tokenData, setTokenData] = useState<{
		totalTokenCount: number;
		tokenDiff: number;
		roundedDiffPercentage: number;
	} | null>(null);

	const [totalTokenData] = useAtom(loadableTokenAtom);

	const { vars } = useTheme();

	useEffect(() => {
		setTokenData(null);
		if (
			!(totalTokenData.state === "loading") &&
			totalTokenData.state === "hasData"
		) {
			const runCalculation = () => {
				const result = getTotalTokens(totalTokenData.data);
				setTokenData(result);
			};
			runCalculation();
		}
	}, [totalTokenData]);

	return (
		<div
			style={{
				padding: "15px",
				alignItems: "center",
			}}
		>
			<Typography align={"center"}>Total Tokens</Typography>
			{totalTokenData.state === "loading" || !tokenData ? (
				<div style={{ marginTop: "15px" }}>
					<Skeleton
						variant={"text"}
						width={100}
						height={40}
						sx={{ margin: "0 auto" }}
						animation={"wave"}
					/>
					<Skeleton
						variant={"text"}
						width={80}
						height={30}
						sx={{ margin: "0 auto" }}
						animation={"wave"}
					/>
				</div>
			) : (
				<Typography variant={"h4"} marginTop={"15px"} align={"center"}>
					{tokenData.totalTokenCount}
					{!Number.isNaN(tokenData.tokenDiff) ? (
						<Typography
							fontSize={"14px"}
							sx={{
								color:
									tokenData.tokenDiff > 0
										? "green"
										: tokenData.tokenDiff === 0
											? vars?.palette.text.primary
											: "red",
							}}
						>
							{tokenData.tokenDiff > 0 ? (
								<TrendingUpIcon />
							) : (
								<TrendingDownIcon />
							)}
							{tokenData.roundedDiffPercentage} %
						</Typography>
					) : null}
				</Typography>
			)}
		</div>
	);
};
export default TotalTokenText;
