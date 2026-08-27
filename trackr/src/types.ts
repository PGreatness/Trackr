export type GoogleTokenResponse = {
	access_token?: string;
	expires_in?: number;
	error?: string;
	error_description?: string;
};

export type TokenClient = {
	requestAccessToken: (options?: { prompt?: string }) => void;
};

declare global {
	interface Window {
		google?: {
			accounts: {
				oauth2: {
					initTokenClient: (config: {
						client_id: string;
						scope: string;
						callback: (response: GoogleTokenResponse) => void;
						error_callback?: () => void;
					}) => TokenClient;
					revoke: (
						accessToken: string,
						callback?: () => void,
					) => void;
				};
			};
		};
	}
}

export type GmailHeader = { name: string; value: string };

export type GmailMessagePart = {
	mimeType?: string;
	body?: { data?: string };
	parts?: GmailMessagePart[];
};

export type GmailMessage = {
	id: string;
	threadId?: string;
	snippet?: string;
	internalDate?: string;
	payload?: GmailMessagePart & { headers?: GmailHeader[] };
};

export type JobStatus = "applied" | "denied" | "interview";
export type RangeKey = "1m" | "3m" | "6m" | "1y" | "2y" | "all" | "custom";
export type CustomDateRange = { start: string; end: string };

export type Email = {
	id: string;
	threadId: string;
	sender: string;
	subject: string;
	date: string;
	timestamp: number;
	paragraphs: string[];
	autoStatus: JobStatus;
};

export type ScanProgress = { loaded: number; total: number };
