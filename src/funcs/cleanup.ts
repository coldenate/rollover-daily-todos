import { BuiltInPowerupCodes, ReactRNPlugin } from '@remnote/plugin-sdk';

export async function cleanupPastDocuments(plugin: ReactRNPlugin) {
	const rolledPowerup = await plugin.powerup.getPowerupByCode('rolled');
	const rolledOverRems = await rolledPowerup?.taggedRem();

	if (!rolledOverRems) {
		return;
	}

	for (const rem of rolledOverRems) {
		const dailyDocument = await plugin.powerup.getPowerupByCode(
			BuiltInPowerupCodes.DailyDocument
		);
		if (dailyDocument?.children?.includes(rem._id)) {
			continue;
		}
		rem.remove();
	}
}
