import { ReactRNPlugin } from '@remnote/plugin-sdk';
import { handleUnfinishedTodos } from './todoRemManagement';
import { cleanupPastDocuments } from './cleanup';

type AutoRolloverOptions = {
	force?: boolean;
	source?: string;
};

export async function autoRollover(plugin: ReactRNPlugin, options: AutoRolloverOptions = {}) {
	const force = options.force === true;
	const source = options.source ?? 'scheduler';
	const debugMode = Boolean(await plugin.settings.getSetting('debug-mode'));
	const shouldLog = debugMode || force;

	const log = (message: string, details?: unknown) => {
		if (!shouldLog) return;
		if (details !== undefined) {
			console.log(`[RTD:autoRollover][${source}] ${message}`, details);
			return;
		}
		console.log(`[RTD:autoRollover][${source}] ${message}`);
	};

	const logError = (message: string, error: unknown) => {
		console.error(`[RTD:autoRollover][${source}] ${message}`, error);
	};

	try {
		let isNextDay = false;
		const today = new Date();
		const hoursAndMinutesOfTimeToAutoRollover: string =
			await plugin.settings.getSetting('autoRollover');
		const lastAutoRolloverTimeStr = await plugin.storage.getSynced('lastAutoRolloverTime');
		const lastAutoRolloverTime: Date | undefined = lastAutoRolloverTimeStr
			? new Date(lastAutoRolloverTimeStr as string)
			: undefined;

		if (lastAutoRolloverTime && !Number.isNaN(lastAutoRolloverTime.getTime())) {
			const lastAutoRolloverTimeDay = lastAutoRolloverTime.getDate();
			const todayDay = today.getDate();
			isNextDay = lastAutoRolloverTimeDay !== todayDay;
		}

		const hoursAndMinutes = hoursAndMinutesOfTimeToAutoRollover.split(':');
		const hours = Number(hoursAndMinutes[0]);
		const minutes = Number(hoursAndMinutes[1]);
		if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
			logError(
				`Invalid auto rollover time setting "${hoursAndMinutesOfTimeToAutoRollover}".`,
				new Error('Expected "hh:mm" in 24-hour format')
			);
			return;
		}

		const todayHours = today.getHours();
		const todayMinutes = today.getMinutes();
		const isPastRolloverTime =
			todayHours > hours || (todayHours === hours && todayMinutes >= minutes);
		const shouldRun = force || (isNextDay && isPastRolloverTime);

		log('Decision state', {
			now: today.toISOString(),
			lastAutoRolloverTime: lastAutoRolloverTime?.toISOString?.(),
			isNextDay,
			autoRolloverSetting: hoursAndMinutesOfTimeToAutoRollover,
			isPastRolloverTime,
			force,
			shouldRun,
		});

		if (!shouldRun) {
			log('Skipping rollover because conditions were not met.');
			return;
		}

		const isAutoRolloverDisabled = await plugin.settings.getSetting('disable-auto-rollover');
		if (isAutoRolloverDisabled && !force) {
			log('Auto rollover is disabled; skipping rollover actions.');
		} else {
			if (isAutoRolloverDisabled && force) {
				log('Auto rollover is disabled, but force=true so running actions anyway.');
			}
			await cleanupPastDocuments(plugin);
			await handleUnfinishedTodos(plugin);
			log('Rollover actions finished.');
		}

		await plugin.storage.setSynced('lastAutoRolloverTime', today);
		log('Updated lastAutoRolloverTime.', today.toISOString());
	} catch (error) {
		logError('Unhandled error while running auto rollover.', error);
		throw error;
	}
}
