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

function hasHappened(date: Date): boolean {
	const today = new Date();

	today.setHours(0, 0, 0, 0);
	date.setHours(0, 0, 0, 0);

	return date <= today;
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

function acceptTodoRem(dailyDocument: Rem, todoRems: { [key: string]: any[] }, rem: Rem) {
	const text = String(dailyDocument.text); // 'May 15th, 2023'
	const dateWithoutSuffix = text.replace(/(\d+)(st|nd|rd|th)/, '$1');
	const date = new Date(dateWithoutSuffix);

	if (hasHappened(date)) {
		if (todoRems[text]) {
			todoRems[text].push(rem);
		} else {
			todoRems[text] = [rem];
		}
	}
}

async function getIncompleteTodos(
	plugin: ReactRNPlugin,
	remId: any,
	todoRems: { [key: string]: any[] },
	dailyDocument: Rem
) {
	await processRem(plugin, remId, todoRems, dailyDocument);
}

async function processRem(
	plugin: ReactRNPlugin,
	remId: any,
	todoRems: { [key: string]: any[] },
	dailyDocument: Rem,
	rememberedParent: Rem | undefined = undefined
) {
	const rem: Rem | undefined = await plugin.rem.findOne(remId);

	if (rem && (await isUnfinishedTodo(rem))) {
		if (rememberedParent) {
			acceptTodoRem(dailyDocument, todoRems, rememberedParent);
			return;
		}
		acceptTodoRem(dailyDocument, todoRems, rem);
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
		id: 'debug-auto-rollover',
		name: 'Debug Auto Rollover',
		description: 'Set the last rollover time to seven days ago',
		quickCode: 'debug',
		icon: '🐛',
		keywords: 'debug, auto, rollover',
		keyboardShortcut: 'ctrl+shift+alt+d',
		action: async () => {
			await plugin.storage.setSynced(
				'lastRollover',
				new Date(new Date().setDate(new Date().getDate() - 7))
			);
			await plugin.storage.setSynced(
				'mostRecentAutoRollover',
				new Date(new Date().setDate(new Date().getDate() - 7))
			);
			await autoRollover(plugin);
		},
	});

	// settings

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
		defaultValue: '00:00',
		validators: [
			{
				type: 'regex',
				arg: '^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$',
			},
		],
	});

	// jobs
	await autoRollover(plugin);
}
async function autoRollover(plugin: ReactRNPlugin) {
	const lastRolloverTime: Date | undefined = await plugin.storage.getSynced('lastRollover');
	const autoRolloverTime: string | undefined = await plugin.settings.getSetting('autoRollover'); // hh:mm
	const lastRolloverDate: Date | undefined = lastRolloverTime
		? new Date(lastRolloverTime)
		: undefined;
	// take hh:mm and convert that to a Date object for today
	const autoRolloverDate: Date | undefined = autoRolloverTime
		? new Date(new Date().toLocaleDateString() + ' ' + autoRolloverTime)
		: undefined;

	// get the most recent autoRolloverDate, and if it matches autoRolloverDate, then return
	const mostRecentAutoRollover: Date | undefined = await plugin.storage.getSynced(
		'mostRecentAutoRollover'
	);
	if (mostRecentAutoRollover && autoRolloverDate && mostRecentAutoRollover >= autoRolloverDate) {
		return;
	}

	await plugin.storage.setSynced('mostRecentAutoRollover', autoRolloverDate);

	// if it has been more than 24 hours since the last rollover,s
	// AND it is past the autoRolloverTime for the past 24 hours, then rollover
	if (
		lastRolloverTime &&
		howLongAgo(lastRolloverTime) > 0 && // Adjusted the condition here
		autoRolloverDate &&
		autoRolloverDate < new Date()
	) {
		await handleUnfinishedTodos(plugin);
		await plugin.storage.setSynced('lastRollover', new Date());
	}
}

async function handleUnfinishedTodos(plugin: ReactRNPlugin) {
	let dateLimit: number = await plugin.settings.getSetting('dateLimit');
	console.log('dateLimit:', dateLimit);
	const dailyDocument = await plugin.powerup.getPowerupByCode(BuiltInPowerupCodes.DailyDocument);
	console.log('dailyDocument:', dailyDocument);
	const dailyDocuments = await dailyDocument?.taggedRem();
	console.log('dailyDocuments:', dailyDocuments);

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
		console.log('dailyDocument:', dailyDocument, howLongAgo(createdAt));
		const daysAgo: number = howLongAgo(createdAt);
		if (daysAgo > dateLimit) {
			console.log('daysAgo:', daysAgo, dateLimit);

			continue;
		}
		await getIncompleteTodos(plugin, dailyDocument._id, todoRems, dailyDocument);
	}
	console.log('todoRems:', todoRems);

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
		// we can handle whether the user wants to create a daily document if it doesn't exist. This is optional because ya know, maybe they don't want to create a daily document
	}

	for (const dateString in todoRems) {
		let remArray: Array<any> = todoRems[dateString];
		for (const rem of remArray) {
			const newRems = await plugin.rem.moveRems([rem], todayDailyDocument, 0);
		}
	}

	return todoRems;
}

async function onDeactivate(_: ReactRNPlugin) {
	console.error('Deactivated!');
}

declareIndexPlugin(onActivate, onDeactivate);
