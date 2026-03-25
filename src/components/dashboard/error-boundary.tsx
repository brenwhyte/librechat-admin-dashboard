"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
	children: ReactNode;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

/**
 * Error Boundary for the dashboard.
 * Catches unhandled React rendering errors and displays a recovery UI
 * instead of crashing the entire page.
 */
class DashboardErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		console.error("[DashboardErrorBoundary] Caught error:", error, errorInfo);
	}

	handleRetry = () => {
		this.setState({ hasError: false, error: null });
	};

	render() {
		if (this.state.hasError) {
			return (
				<Box
					sx={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						minHeight: "60vh",
						padding: 4,
						textAlign: "center",
					}}
				>
					<Typography variant="h5" gutterBottom>
						Something went wrong
					</Typography>
					<Typography
						variant="body2"
						color="text.secondary"
						sx={{ maxWidth: 480, mb: 3 }}
					>
						The dashboard encountered an unexpected error. This may be caused by
						a temporary connection issue. Click below to try again.
					</Typography>
					{this.state.error && (
						<Typography
							variant="caption"
							color="text.secondary"
							sx={{
								fontFamily: "monospace",
								maxWidth: 600,
								mb: 3,
								wordBreak: "break-word",
							}}
						>
							{this.state.error.message}
						</Typography>
					)}
					<Button variant="contained" onClick={this.handleRetry}>
						Retry
					</Button>
				</Box>
			);
		}

		return this.props.children;
	}
}

export default DashboardErrorBoundary;
