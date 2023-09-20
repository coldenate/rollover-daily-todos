import { ReactRNPlugin } from '@remnote/plugin-sdk';
import { handleUnfinishedTodos } from './todoRemManagement';

export async function autoRollover(plugin: ReactRNPlugin) {
	let isNextDay: boolean = false;
	const today = new Date();
	const hoursAndMinutesOfTimeToAutoRollover: string = await plugin.settings.getSetting(
		'autoRollover'
	);
	const lastAutoRolloverTimeStr = await plugin.storage.getSynced('lastAutoRolloverTime');
	const lastAutoRolloverTime: Date | undefined = lastAutoRolloverTimeStr
		? new Date(lastAutoRolloverTimeStr as string)
		: undefined;

	if (lastAutoRolloverTime) {
		const lastAutoRolloverTimeDay = lastAutoRolloverTime.getDate();
		const todayDay = today.getDate();

		if (lastAutoRolloverTimeDay !== todayDay) {
			isNextDay = true;
		}
	}

	if (isNextDay) {
		const hoursAndMinutes = hoursAndMinutesOfTimeToAutoRollover.split(':');
		const hours = Number(hoursAndMinutes[0]);
		const minutes = Number(hoursAndMinutes[1]);

		const todayHours = today.getHours();
		const todayMinutes = today.getMinutes();

		if (todayHours >= hours && todayMinutes >= minutes) {
			await handleUnfinishedTodos(plugin);
			await plugin.storage.setSynced('lastAutoRolloverTime', today);
		}
	}
}
