import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import { CentreonAPI, buildMonitoringUrl } from "../centreon-api";

const logger = streamDeck.logger.createScope("DualAlert");

const POLL_INTERVAL_MS = 60_000;

type DualAlertSettings = {
	url: string;
	username: string;
	password: string;
	serviceFilter: string;
	hostFilter: string;
};

@action({ UUID: "io.paraita.centreon.alerts.dual" })
export class DualAlert extends SingletonAction<DualAlertSettings> {
	private timers = new Map<string, NodeJS.Timeout>();

	override async onWillAppear(ev: WillAppearEvent<DualAlertSettings>): Promise<void> {
		const { settings } = ev.payload;
		const contextId = ev.action.id;

		await this.updateDisplay(ev, settings);
		this.startPolling(contextId, ev, settings);
	}

	override async onWillDisappear(ev: WillDisappearEvent<DualAlertSettings>): Promise<void> {
		this.stopPolling(ev.action.id);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<DualAlertSettings>): Promise<void> {
		const { settings } = ev.payload;
		const contextId = ev.action.id;

		this.stopPolling(contextId);
		await this.updateDisplay(ev, settings);
		this.startPolling(contextId, ev, settings);
	}

	override async onKeyDown(ev: KeyDownEvent<DualAlertSettings>): Promise<void> {
		const { settings } = ev.payload;
		if (settings.url) {
			const url = buildMonitoringUrl(settings.url, {
				statuses: ["warning", "critical"],
				hostFilter: settings.hostFilter,
				serviceFilter: settings.serviceFilter,
			});
			await streamDeck.system.openUrl(url);
		}
	}

	private startPolling(
		contextId: string,
		ev: WillAppearEvent<DualAlertSettings> | DidReceiveSettingsEvent<DualAlertSettings>,
		settings: DualAlertSettings,
	): void {
		const timer = setInterval(async () => {
			await this.updateDisplay(ev, settings);
		}, POLL_INTERVAL_MS);
		this.timers.set(contextId, timer);
	}

	private stopPolling(contextId: string): void {
		const timer = this.timers.get(contextId);
		if (timer) {
			clearInterval(timer);
			this.timers.delete(contextId);
		}
	}

	private async updateDisplay(
		ev: { action: { setTitle: (title: string) => Promise<void>; setImage: (image: string) => Promise<void> } },
		settings: DualAlertSettings,
	): Promise<void> {
		if (!settings.url || !settings.username || !settings.password) {
			await ev.action.setTitle("--");
			return;
		}

		try {
			const api = new CentreonAPI(settings.url, settings.username, settings.password);
			const counts = await api.getAlertCounts(settings.serviceFilter, settings.hostFilter);

			const svg = `
				<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">
					<rect width="144" height="144" rx="16" fill="#1A1A2E"/>
					<!-- Warning section -->
					<text x="72" y="32" font-family="Arial, sans-serif" font-size="14" fill="#FF8C00" text-anchor="middle" opacity="0.8">WARNING</text>
					<text x="72" y="62" font-family="Arial, sans-serif" font-size="${typeof counts.warning === "string" ? 30 : 40}" font-weight="bold" fill="#FF8C00" text-anchor="middle">${counts.warning}</text>
					<!-- Separator -->
					<line x1="20" y1="76" x2="124" y2="76" stroke="#444" stroke-width="1"/>
					<!-- Critical section -->
					<text x="72" y="100" font-family="Arial, sans-serif" font-size="14" fill="#FF0000" text-anchor="middle" opacity="0.8">CRITICAL</text>
					<text x="72" y="132" font-family="Arial, sans-serif" font-size="${typeof counts.critical === "string" ? 30 : 40}" font-weight="bold" fill="#FF0000" text-anchor="middle">${counts.critical}</text>
				</svg>
			`.trim();

			const encoded = Buffer.from(svg).toString("base64");
			await ev.action.setImage(`data:image/svg+xml;base64,${encoded}`);
			await ev.action.setTitle("");
		} catch (e) {
			logger.error("Failed to update alert counts", e);
			await ev.action.setTitle("ERR");
		}
	}
}
