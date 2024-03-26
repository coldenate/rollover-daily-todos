import { BuiltInPowerupCodes, ReactRNPlugin } from '@remnote/plugin-sdk';

export async function cleanupPastDocuments(plugin: ReactRNPlugin) {
	const rolledPowerup = await plugin.powerup.getPowerupByCode('rolled');
	const rolledOverRems = await rolledPowerup?.taggedRem();
	const isNotPortalMode = await plugin.settings.getSetting('portal-mode'); 

	if (!rolledOverRems || isNotPortalMode) {
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
