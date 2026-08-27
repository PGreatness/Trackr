import type { JobStatus, RangeKey } from "./types";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as
	| string
	| undefined;
export const MAX_CANDIDATE_EMAILS = 1500;

export const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
	{ value: "1m", label: "1 month" },
	{ value: "3m", label: "3 months" },
	{ value: "6m", label: "6 months" },
	{ value: "1y", label: "1 year" },
	{ value: "2y", label: "2 years" },
	{ value: "all", label: "All time" },
	{ value: "custom", label: "Custom range" },
];

export const STATUS_CONFIG: {
	id: JobStatus;
	label: string;
	description: string;
}[] = [
	{
		id: "applied",
		label: "Applied",
		description: "Applications and confirmations",
	},
	{
		id: "interview",
		label: "Interview requested",
		description: "Invitations and next steps",
	},
	{
		id: "denied",
		label: "Denied",
		description: "Closed or declined applications",
	},
];
