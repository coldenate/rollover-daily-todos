import { BuiltInPowerupCodes, ReactRNPlugin } from '@remnote/plugin-sdk';

export async function cleanupPastDocuments(plugin: ReactRNPlugin) {
	const rolledPowerup = await plugin.powerup.getPowerupByCode('rolled');
	const rolledOverRems = await rolledPowerup?.taggedRem();

	if (!rolledOverRems) {
		return;
	}

	plugin.app.toast('Cleaning up past documents of portals and orphaned rolled over rem...');
	console.log(rolledOverRems);

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
