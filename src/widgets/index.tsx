import {
	AppEvents,
	BuiltInPowerupCodes,
	declareIndexPlugin,
	ReactRNPlugin,
	Rem,
	RichText,
	RichTextNamespace,
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

	// Don't let this go into production.

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

	// Don't let that go into production.

	// settings

	await plugin.settings.registerBooleanSetting({
		id: 'portal-mode',
		title: 'Portal Mode',
		description:
			"Causes unfinished todos to be portaled into today's daily document, instead of moved.",
		defaultValue: true,
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
	const lastAutoRolloverTime: Date | undefined = await plugin.storage.getSynced(
		'lastAutoRolloverTime'
	);

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
	let dateLimit: number = await plugin.settings.getSetting('dateLimit');
	const dailyDocument = await plugin.powerup.getPowerupByCode(BuiltInPowerupCodes.DailyDocument);
	const dailyDocuments = await dailyDocument?.taggedRem();

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

	await plugin.app.toast('You have some unfinished Todos! Moving them now them to today...');

	// get today's daily document
	const today = new Date();
	const todayText = today.toLocaleDateString('en-US', {
		month: 'long',
		day: 'numeric',
		year: 'numeric',
	});

	const todayDailyDocument = await plugin.date.getTodaysDoc();
	if (!todayDailyDocument) {
		console.log('Sorry. No daily document for TODAY has been created.');
		return;
		// we can handle whether the user wants to create a daily document if it doesn't exist. This is optional because ya know, maybe they don't want to create a daily document. It'll just be waiting in that doc until its made.
	}

	for (const dateString in todoRems) {
		console.log(todoRems);
		const portalMode = await plugin.settings.getSetting('portal-mode');
		for (const todoRem of todoRems[dateString]) {
			if (portalMode) {
				const newPortal = await plugin.rem.createPortal();
				if (newPortal) {
					await plugin.rem.moveRems([newPortal], todayDailyDocument, 0);
					console.log(todoRem?.rememberedParent);
					console.log(todoRem?.rem);
					await todoRem?.rememberedParent?.addToPortal(newPortal);
					await todoRem?.rem.addToPortal(newPortal);
				}
			} else if (!portalMode) {
				const newRems = await plugin.rem.moveRems([todoRem.rem], todayDailyDocument, 0);
			}
		}
	}

	return todoRems;
}

async function onDeactivate(_: ReactRNPlugin) {
	console.error('Deactivated!');
}

declareIndexPlugin(onActivate, onDeactivate);
