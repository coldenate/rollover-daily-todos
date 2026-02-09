import { BuiltInPowerupCodes, ReactRNPlugin } from '@remnote/plugin-sdk';

export async function cleanupPastDocuments(plugin: ReactRNPlugin) {
	const rolledPowerup = await plugin.powerup.getPowerupByCode('rolled');
	const rolledOverRems = await rolledPowerup?.taggedRem();
	const portalMode = await plugin.settings.getSetting('portal-mode');

	// In portal mode, rolled portals should remain in past daily docs so completed
	// items can still be reviewed historically.
	if (!rolledOverRems || portalMode) {
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
