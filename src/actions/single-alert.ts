import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import { CentreonAPI, buildMonitoringUrl } from "../centreon-api";

const logger = streamDeck.logger.createScope("SingleAlert");

const POLL_INTERVAL_MS = 60_000;

type SingleAlertSettings = {
	url: string;
	username: string;
	password: string;
	severity: "warning" | "critical";
	serviceFilter: string;
	hostFilter: string;
};

@action({ UUID: "io.paraita.centreon.alerts.single" })
export class SingleAlert extends SingletonAction<SingleAlertSettings> {
	private timers = new Map<string, NodeJS.Timeout>();

	override async onWillAppear(ev: WillAppearEvent<SingleAlertSettings>): Promise<void> {
		const { settings } = ev.payload;
		const contextId = ev.action.id;

		await this.updateDisplay(ev, settings);
		this.startPolling(contextId, ev, settings);
	}

	override async onWillDisappear(ev: WillDisappearEvent<SingleAlertSettings>): Promise<void> {
		this.stopPolling(ev.action.id);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<SingleAlertSettings>): Promise<void> {
		const { settings } = ev.payload;
		const contextId = ev.action.id;

		this.stopPolling(contextId);
		await this.updateDisplay(ev, settings);
		this.startPolling(contextId, ev, settings);
	}

	override async onKeyDown(ev: KeyDownEvent<SingleAlertSettings>): Promise<void> {
		const { settings } = ev.payload;
		if (settings.url) {
			const severity = settings.severity || "critical";
			const url = buildMonitoringUrl(settings.url, {
				statuses: [severity],
				hostFilter: settings.hostFilter,
				serviceFilter: settings.serviceFilter,
			});
			await streamDeck.system.openUrl(url);
		}
	}

	private startPolling(
		contextId: string,
		ev: WillAppearEvent<SingleAlertSettings> | DidReceiveSettingsEvent<SingleAlertSettings>,
		settings: SingleAlertSettings,
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
		settings: SingleAlertSettings,
	): Promise<void> {
		if (!settings.url || !settings.username || !settings.password) {
			await ev.action.setTitle("--");
			return;
		}

		try {
			const api = new CentreonAPI(settings.url, settings.username, settings.password);
			const counts = await api.getAlertCounts(settings.serviceFilter, settings.hostFilter);
			const severity = settings.severity || "critical";
			const count = severity === "warning" ? counts.warning : counts.critical;
			const color = severity === "warning" ? "#FF8C00" : "#FF0000";
			const bgColor = severity === "warning" ? "#3D2600" : "#3D0000";

			const fontSize = typeof count === "string" ? 44 : 64;
			const svg = `
				<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">
					<rect width="144" height="144" rx="16" fill="${bgColor}"/>
					<text x="72" y="82" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="${color}" text-anchor="middle" dominant-baseline="middle">${count}</text>
					<text x="72" y="128" font-family="Arial, sans-serif" font-size="16" fill="${color}" text-anchor="middle" opacity="0.8">${severity.toUpperCase()}</text>
				</svg>
			`.trim();

			const encoded = Buffer.from(svg).toString("base64");
			await ev.action.setImage(`data:image/svg+xml;base64,${encoded}`);
			await ev.action.setTitle("");
		} catch (e) {
			logger.error("Failed to update alert count", e);
			await ev.action.setTitle("ERR");
		}
	}
}
