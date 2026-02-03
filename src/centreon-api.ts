import streamDeck from "@elgato/streamdeck";

const logger = streamDeck.logger.createScope("CentreonAPI");

export interface AlertCounts {
	warning: number | string;
	critical: number | string;
}

interface CentreonService {
	host_id: number;
	name: string;
	description: string;
	service_id: number;
	state: number;
	state_type: number;
	output: string;
	max_check_attempts: number;
	check_attempt: number;
	last_check: number;
	last_state_change: number;
	last_hard_state_change: number;
	acknowledged: number;
	criticality: number | null;
}

export function buildCentreonUrl(baseUrl: string): string {
	let url = baseUrl.trim().replace(/\/+$/, "");
	if (!/^https?:\/\//i.test(url)) {
		url = `https://${url}`;
	}
	return url;
}

export function buildMonitoringUrl(
	baseUrl: string,
	options: {
		statuses?: string[];
		hostFilter?: string;
		serviceFilter?: string;
	},
): string {
	const url = buildCentreonUrl(baseUrl);

	const parts: string[] = [];

	if (options.statuses && options.statuses.length > 0) {
		parts.push(`status:${options.statuses.join(",")}`);
	}

	if (options.hostFilter) {
		parts.push(`parent_name:${options.hostFilter}`);
	}

	if (options.serviceFilter) {
		parts.push(options.serviceFilter);
	}

	const search = parts.join(" ");
	const criterias = [{ name: "search", value: search }];
	const filter = JSON.stringify({ criterias, name: "current_filter" });
	return `${url}/centreon/monitoring/resources?filter=${encodeURIComponent(filter)}`;
}

export class CentreonAPI {
	private authToken: string | null = null;
	private tokenUrl: string;
	private apiUrl: string;

	constructor(
		private baseUrl: string,
		private username: string,
		private password: string,
	) {
		const url = buildCentreonUrl(baseUrl);
		this.tokenUrl = `${url}/centreon/api/index.php?action=authenticate`;
		this.apiUrl = `${url}/centreon/api/index.php`;
		logger.info(`Centreon API configured: ${this.apiUrl}`);
	}

	private async authenticate(): Promise<string> {
		const body = new URLSearchParams({
			username: this.username,
			password: this.password,
		});

		const response = await fetch(this.tokenUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: body.toString(),
		});

		if (!response.ok) {
			throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
		}

		const data = (await response.json()) as { authToken: string };
		this.authToken = data.authToken;
		logger.info("Successfully authenticated with Centreon");
		return this.authToken;
	}

	private async getToken(): Promise<string> {
		if (!this.authToken) {
			return this.authenticate();
		}
		return this.authToken;
	}

	private async fetchServices(): Promise<CentreonService[]> {
		const token = await this.getToken();
		const url = `${this.apiUrl}?object=centreon_realtime_services&action=list&limit=100000`;

		const response = await fetch(url, {
			method: "GET",
			headers: { "centreon-auth-token": token },
		});

		if (response.status === 401 || response.status === 403) {
			logger.info("Token expired, re-authenticating...");
			this.authToken = null;
			const newToken = await this.authenticate();

			const retryResponse = await fetch(url, {
				method: "GET",
				headers: { "centreon-auth-token": newToken },
			});

			if (!retryResponse.ok) {
				throw new Error(`Failed to fetch services: ${retryResponse.status}`);
			}

			const data = (await retryResponse.json()) as CentreonService[];
			logger.info(`Fetched ${data.length} services (after re-auth)`);
			return data;
		}

		if (!response.ok) {
			throw new Error(`Failed to fetch services: ${response.status}`);
		}

		const data = (await response.json()) as CentreonService[];
		logger.info(`Fetched ${data.length} services`);
		return data;
	}

	async getAlertCounts(serviceFilter?: string, hostFilter?: string): Promise<AlertCounts> {
		const services = await this.fetchServices();

		logger.info(`Filters - host: "${hostFilter || ""}", service: "${serviceFilter || ""}"`);

		let filtered = services;

		if (hostFilter) {
			try {
				const regex = new RegExp(hostFilter, "i");
				filtered = filtered.filter((s) => regex.test(s.name));
				logger.info(`After host filter: ${filtered.length} services`);
			} catch (e) {
				logger.error(`Invalid host regex: ${hostFilter}`, e);
			}
		}

		if (serviceFilter) {
			try {
				const regex = new RegExp(serviceFilter, "i");
				filtered = filtered.filter((s) => regex.test(s.description));
				logger.info(`After service filter: ${filtered.length} services`);
			} catch (e) {
				logger.error(`Invalid service regex: ${serviceFilter}`, e);
			}
		}

		// Centreon states: 0=OK, 1=WARNING, 2=CRITICAL, 3=UNKNOWN
		// state is a number, not a string
		const warningCount = filtered.filter((s) => s.state === 1).length;
		const criticalCount = filtered.filter((s) => s.state === 2).length;

		// Count without filters for comparison
		const totalWarning = services.filter((s) => s.state === 1).length;
		const totalCritical = services.filter((s) => s.state === 2).length;
		logger.info(`Unfiltered totals - Warning: ${totalWarning}, Critical: ${totalCritical} (${services.length} services)`);

		const counts: AlertCounts = {
			warning: warningCount > 100 ? "100+" : warningCount,
			critical: criticalCount > 100 ? "100+" : criticalCount,
		};

		logger.info(`Alert counts - Warning: ${counts.warning}, Critical: ${counts.critical} (filtered: ${filtered.length})`);
		return counts;
	}
}
