import { ReactRNPlugin } from '@remnote/plugin-sdk';

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
		// Non-portal mode creates transient wrapper rems under each daily doc.
		// Once rollover moves all unfinished children onward, empty wrappers can be deleted.
		if ((rem.children ?? []).length > 0) {
			continue;
		}
		await rem.remove();
	}
}
