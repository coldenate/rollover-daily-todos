import { declareIndexPlugin, ReactRNPlugin } from '@remnote/plugin-sdk';
import { handleUnfinishedTodos } from '../funcs/todoRemManagement';
import { autoRollover } from '../funcs/autoRollover';

let clearToAutoRoll: boolean = false;
let plugin_passthrough: ReactRNPlugin;

setTimeout(() => {
	setInterval(async () => {
		if (clearToAutoRoll) {
			await autoRollover(plugin_passthrough);
		}
	}, 5000);
}, 25);

async function onActivate(plugin: ReactRNPlugin) {
	// settings
	await plugin.settings.registerStringSetting({
		id: 'autoRollover',
		title: 'Time of Day to Rollover Todos',
		description:
			'The time of day to rollover todos. This is in local time. (hh:mm) 24 hour format',
		defaultValue: '23:00',
		validators: [
			{
				type: 'regex',
				arg: '^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$',
			},
		],
	});

	await plugin.settings.registerBooleanSetting({
		id: 'portal-mode',
		title: 'Portal Mode',
		description:
			"Causes unfinished todos to be portaled into today's daily document, instead of moved.",
		defaultValue: false,
	});

	await plugin.settings.registerBooleanSetting({
		id: 'debug-mode',
		title: 'Debug Mode',
		description:
			'Enables certain testing commands. Non-destructive. Please restart RemNote after enabling.',
		defaultValue: false,
	});

	await plugin.settings.registerNumberSetting({
		id: 'dateLimit',
		title: 'Date Limit',
		description: 'The number of days to look back for unfinished todos',
		defaultValue: 7,
	});

	// commands

	await plugin.app.registerCommand({
		id: 'rollover-todos',
		name: 'Rollover Unfinished Todos',
		quickCode: 'rollover',
		icon: '📅',
		keywords: 'rollover, todos, unfinished',
		keyboardShortcut: 'ctrl+shift+alt+o',
		action: async () => {
			await handleUnfinishedTodos(plugin);
		},
	});

	await plugin.app.registerCommand({
		id: 'do-not-rollover',
		name: 'Do Not Rollover Rem',
		quickCode: 'dnr',
		keywords: 'do, not, rollover, rem',
		action: async () => {
			const rem = await plugin.focus.getFocusedRem();
			await rem?.addPowerup('doNotRollover');

			// if (await rem.hasPowerup('doNotRollover')) {
			// 	await rem.removePowerup('doNotRollover');
			// 	return;
			// }

			// developer note: for now, I am not allowing this plugin the permission to delete anything. (see manifest.json)
			// upon popular request, I will allow this plugin to delete things. but that is only if it seems necessary.
		},
	});

	await plugin.settings.getSetting('debug-mode').then(async (setting) => {
		if (setting) {
			await plugin.app.registerCommand({
				id: 'debug-auto-rollover',
				name: 'Debug Auto Rollover',
				description: 'Set the last rollover time to seven days ago',
				quickCode: 'debug',
				icon: '🐛',
				keywords: 'debug, auto, rollover',
				keyboardShortcut: 'ctrl+shift+alt+d',
				action: async () => {
					await plugin.storage.setSynced(
						'lastAutoRolloverTime',
						new Date(new Date().setDate(new Date().getDate() - 1))
					);
					// await autoRollover(plugin);
				},
			});

			await plugin.app.registerCommand({
				id: 'bump-auto-rollover',
				name: 'Bump Auto Rollover',
				description:
					'Ping the Auto Rollover Checker to make sure your stuff is automatically rolling over',
				quickCode: 'debug bump',
				icon: '🐛',
				keywords: 'debug, bump, auto, rollover',
				action: async () => {
					await autoRollover(plugin);
				},
			});

			await plugin.app.registerCommand({
				id: 'log-values',
				name: 'Log Values',
				description: 'Log the values of certain variables',
				quickCode: 'debug log',
				icon: '🐛',
				action: async () => {
					console.log('lastAutoRolloverTime: ');
					console.log(await plugin.storage.getSynced('lastAutoRolloverTime'));

					console.log('lastRolloverTime: ');
					console.log(await plugin.storage.getSynced('lastRolloverTime'));

					console.log('autoRolloverTime: ');
					console.log(await plugin.settings.getSetting('autoRollover'));

					console.log('dateLimit: ');
					console.log(await plugin.settings.getSetting('dateLimit'));

					console.log('debugMode: ');
					console.log(await plugin.settings.getSetting('debug-mode'));

					console.log('portalMode: ');
					console.log(await plugin.settings.getSetting('portal-mode'));

					await plugin.app.toast(
						`Last Auto Rollover Time: ${await plugin.storage.getSynced(
							'lastAutoRolloverTime'
						)}`
					);
				},
			});
		}
	});

	// powerups

	await plugin.app.registerPowerup(
		'Do Not Rollover',
		'doNotRollover',
		'Tag this to a rem to prevent it from being rolled over.',
		{
			slots: [
				{
					code: 'reason',
					name: 'Reason',
					onlyProgrammaticModifying: false,
					hidden: false,
				},
			],
		}
	);

	// jobs
	plugin_passthrough = plugin;
	clearToAutoRoll = true;
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
