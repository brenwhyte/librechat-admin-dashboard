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

async function avgTokenPerMessage(
	tokensPerMessage: AvgTokensPerMessage[],
): Promise<{
	prevAvgTokensPerMessageRounded: number;
	tokenDiff: number;
	roundedDiffPercentage: number;
}> {
	const first: AvgTokensPerMessage = tokensPerMessage[0];

	const avgTokensPerMessage =
		first.totalMessages > 0 ? first.totalTokenCount / first.totalMessages : 0;
	const prevAvgTokensPerMessage =
		first.prevTotalTokenCount / first.prevTotalMessages;
	const prevAvgTokensPerMessageRounded = Number(avgTokensPerMessage.toFixed(2));

	const tokenDiff = avgTokensPerMessage - prevAvgTokensPerMessage;

	const requestDiffPercentage = (tokenDiff / prevAvgTokensPerMessage) * 100;
	const roundedDiffPercentage =
		Math.round(requestDiffPercentage * 10 ** 2) / 10 ** 2;

	return { prevAvgTokensPerMessageRounded, tokenDiff, roundedDiffPercentage };
}

const loadableTokenPerMessageAtom = loadable(tokensPerMessageAtom);

const TokensPerMessage = () => {
	const [tokensPerMessage] = useAtom(loadableTokenPerMessageAtom);

	const [messageData, setMessageData] = useState<{
		prevAvgTokensPerMessageRounded: number;
		tokenDiff: number;
		roundedDiffPercentage: number;
	} | null>(null);

	const { vars } = useTheme();

	useEffect(() => {
		setMessageData(null);
		if (
			!(tokensPerMessage.state === "loading") &&
			tokensPerMessage.state === "hasData"
		) {
			const runCalculation = async () => {
				const result = await avgTokenPerMessage(tokensPerMessage.data);
				setMessageData(result);
			};
			runCalculation();
		}
	}, [tokensPerMessage]);

	return (
		<div
			style={{
				padding: "15px",
				alignItems: "center",
			}}
		>
			<Typography align={"center"}>Average Tokens per Message</Typography>
			{tokensPerMessage.state === "loading" || !messageData ? (
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
					{messageData.prevAvgTokensPerMessageRounded} {"\u2205"}
					{!Number.isNaN(messageData.tokenDiff) ? (
						<Typography
							fontSize={"14px"}
							sx={{
								color:
									messageData.tokenDiff > 0
										? "green"
										: messageData.tokenDiff === 0
											? vars?.palette.text.primary
											: "red",
							}}
						>
							{messageData.tokenDiff > 0 ? (
								<TrendingUpIcon />
							) : (
								<TrendingDownIcon />
							)}
							{messageData.roundedDiffPercentage} %
						</Typography>
					) : null}
				</Typography>
			)}
		</div>
	);
};
export default TokensPerMessage;
