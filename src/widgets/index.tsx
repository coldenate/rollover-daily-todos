import {
	AppEvents,
	BuiltInPowerupCodes,
	declareIndexPlugin,
	PropertyType,
	ReactRNPlugin,
	Rem,
	RichText,
	RichTextNamespace,
	SelectSourceType,
	WidgetLocation,
} from '@remnote/plugin-sdk';
import '../style.css';
import '../App.css';
import React, { useEffect, useState } from 'react';

let clearToAutoRoll: boolean = false;
let plugin_passthrough: ReactRNPlugin;
let timeSettingsChanged: boolean = false;

function hasHappened(date: Date): boolean {
	const today = new Date();

	today.setHours(0, 0, 0, 0);
	date.setHours(0, 0, 0, 0);

	return date < today;
}

function howLongAgo(date: Date): number {
	const today = new Date();

	today.setHours(0, 0, 0, 0);
	date.setHours(0, 0, 0, 0);

	const diff = today.getTime() - date.getTime();

	const days = Math.floor(diff / (1000 * 60 * 60 * 24));

	if (days === 0) {
		return days;
	} else if (days === 1) {
		return days;
	} else {
		return days;
	}
}

async function isUnfinishedTodo(rem: any): Promise<boolean> {
	return (await rem.isTodo()) && (await rem.getTodoStatus()) === 'Unfinished';
}
async function isFinishedTodo(rem: any): Promise<boolean> {
	return (await rem.isTodo()) && (await rem.getTodoStatus()) === 'Finished';
}

interface TodoRem {
	rem: Rem;
	rememberedParent?: Rem;
}

function acceptTodoRem(
	dailyDocument: Rem,
	todoRems: { [key: string]: TodoRem[] },
	rem: Rem,
	rememberedParent?: Rem
) {
	const text = String(dailyDocument.text); // 'May 15th, 2023'
	const dateWithoutSuffix = text.replace(/(\d+)(st|nd|rd|th)/, '$1');
	const date = new Date(dateWithoutSuffix);

	if (hasHappened(date)) {
		if (todoRems[text]) {
			todoRems[text].push({ rem: rem, rememberedParent: rememberedParent });
		} else {
			todoRems[text] = [{ rem: rem, rememberedParent: rememberedParent }];
		}
	}
}

async function getIncompleteTodos(
	plugin: ReactRNPlugin,
	remId: any,
	todoRems: { [key: string]: TodoRem[] },
	dailyDocument: Rem
) {
	await processRem(plugin, remId, todoRems, dailyDocument);
}

async function processRem(
	plugin: ReactRNPlugin,
	remId: any,
	todoRems: { [key: string]: TodoRem[] },
	dailyDocument: Rem,
	rememberedParent: Rem | undefined = undefined
) {
	const rem: Rem | undefined = await plugin.rem.findOne(remId);

	if (rem && (await isUnfinishedTodo(rem))) {
		if (await rememberedParent?.hasPowerup('doNotRollover')) {
			return;
		}
		if (await rem.hasPowerup('doNotRollover')) {
			return;
		}
		if (rememberedParent) {
			acceptTodoRem(dailyDocument, todoRems, rem, rememberedParent);
		} else {
			acceptTodoRem(dailyDocument, todoRems, rem);
		}
		return;
	}

	if (rem && (await isFinishedTodo(rem))) {
		return;
	}

	if (rem?.children) {
		for (const childId of rem.children) {
			await processRem(plugin, childId, todoRems, dailyDocument, rem);
		}
	}
}

setTimeout(() => {
	setInterval(async () => {
		await autoRollover(plugin_passthrough);
	}, 5000);
}, 25);
async function onActivate(plugin: ReactRNPlugin) {
	// A command that inserts text into the editor if focused.

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

	// Don't let this go into production.

	// await plugin.app.registerCommand({
	// 	id: 'debug-auto-rollover',
	// 	name: 'Debug Auto Rollover',
	// 	description: 'Set the last rollover time to seven days ago',
	// 	quickCode: 'debug',
	// 	icon: '🐛',
	// 	keywords: 'debug, auto, rollover',
	// 	keyboardShortcut: 'ctrl+shift+alt+d',
	// 	action: async () => {
	// 		await plugin.storage.setSynced(
	// 			'lastAutoRolloverTime',
	// 			new Date(new Date().setDate(new Date().getDate() - 1))
	// 		);
	// 		// await autoRollover(plugin);
	// 	},
	// });

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

	// Don't let that go into production.

	// settings

	await plugin.settings.registerBooleanSetting({
		id: 'portal-mode',
		title: 'Portal Mode',
		description:
			"Causes unfinished todos to be portaled into today's daily document, instead of moved.",
		defaultValue: false,
	});

	await plugin.settings.registerNumberSetting({
		id: 'dateLimit',
		title: 'Date Limit',
		description: 'The number of days to look back for unfinished todos',
		defaultValue: 7,
	});

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

	// powerups

	await plugin.app.registerPowerup(
		'Copied Parent Rem', // human-readable name
		'copiedParentRem', // powerup code used to uniquely identify the powerup
		'Automatically tagged to Rems that were made as a copy of another rem as a result of Rolling Over Daily Todos', // description
		{
			slots: [
				{
					// slot code used to uniquely identify the powerup slot
					code: 'originalRem',
					// human readable slot code name
					name: 'Original Rem',
					// (optional: false by default)
					// only allow the slot to be modified programatically
					onlyProgrammaticModifying: true,
					// (optional: false by default)
					// hide the slot - don't show it in the editor
					hidden: true,
					selectSourceType: SelectSourceType.Relation,
				},
			],
		}
	);

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

async function autoRollover(plugin: ReactRNPlugin) {
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

async function handleUnfinishedTodos(plugin: ReactRNPlugin) {
	let parentRemsAlreadyRolledOver: Rem[] = [];
	let dateLimit: number = await plugin.settings.getSetting('dateLimit');
	const dailyDocument = await plugin.powerup.getPowerupByCode(BuiltInPowerupCodes.DailyDocument);
	const dailyDocuments = await dailyDocument?.taggedRem();
	const portalMode = await plugin.settings.getSetting('portal-mode');

	const todoRems: any = {};
	// handle if daily document is undefined and if todoRem is undefined
	if (!dailyDocument) {
		return;
	}

	if (!dailyDocuments) {
		return;
	}

	for (const dailyDocument of dailyDocuments) {
		const createdAt = new Date(dailyDocument.createdAt);
		const daysAgo: number = howLongAgo(createdAt);
		if (daysAgo > dateLimit) {
			continue;
		}
		await getIncompleteTodos(plugin, dailyDocument._id, todoRems, dailyDocument);
	}

	// if there are no unfinished todos, return
	if (todoRems.length === 0) {
		return;
	}

	// get today's daily document
	const today = new Date();
	const todayText = today.toLocaleDateString('en-US', {
		month: 'long',
		day: 'numeric',
		year: 'numeric',
	});

	const todayDailyDocument = await plugin.date.getTodaysDoc();
	if (!todayDailyDocument) {
		console.info('Sorry. No daily document for TODAY has been created.');
		return;
		// we can handle whether the user wants to create a daily document if it doesn't exist. This is optional because ya know, maybe they don't want to create a daily document. It'll just be waiting in that doc until its made.
	}

	await plugin.app.toast("Moving unfinished todos to today's Daily Document.");

	for (const dateString in todoRems) {
		let copiedParent: Rem | undefined = undefined;
		if (portalMode) {
			// due to the behavior of remnote portals, we only need to create a portal for the parent rem once.
			if (parentRemsAlreadyRolledOver.includes(todoRems[dateString][0].rememberedParent)) {
				continue;
			}
			const newPortal = await plugin.rem.createPortal();
			if (!newPortal) {
				continue;
			}
			await plugin.rem.moveRems([newPortal], todayDailyDocument, 0);
			for (const todoRem of todoRems[dateString]) {
				await todoRem?.rememberedParent?.addToPortal(newPortal);
				await todoRem?.rem.addToPortal(newPortal);
			}
		} else {
			if (!parentRemsAlreadyRolledOver.includes(todoRems[dateString][0].rememberedParent)) {
				copiedParent = await plugin.rem.createRem();
			}
			if (!copiedParent) {
				continue;
			}
			await copiedParent.setText(todoRems[dateString][0].rememberedParent?.text);
			await copiedParent.addPowerup('copiedParentRem');
			await copiedParent.setPowerupProperty('copiedParentRem', 'originalRem', [
				todoRems[dateString][0].rememberedParent?._id,
			]);
			await plugin.rem.moveRems([copiedParent], todayDailyDocument, 0);
			for (const todoRem of todoRems[dateString]) {
				await plugin.rem.moveRems([todoRem.rem], copiedParent, 0);
			}
		}
		parentRemsAlreadyRolledOver.push(todoRems[dateString][0].rememberedParent);
	}

	return todoRems;
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
