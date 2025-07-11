import { BuiltInPowerupCodes, ReactRNPlugin, Rem } from '@remnote/plugin-sdk';
import { TodoRems } from '../types/TodoRem';
import { hasHappened, howLongAgo, isFinishedTodo, isUnfinishedTodo } from './calculations';

async function acceptTodoRem(
	dailyDocument: Rem,
	todoRems: TodoRems,
	rem: Rem,
	rememberedParent?: Rem
) {
	const timestamp: string = await dailyDocument.getPowerupProperty(
		BuiltInPowerupCodes.DailyDocument,
		'Timestamp'
	);
	const date = new Date(Number(timestamp) * 1000);

	if (hasHappened(date)) {
		if (todoRems[timestamp]) {
			todoRems[timestamp].push({ rem: rem, rememberedParent: rememberedParent });
		} else {
			todoRems[timestamp] = [{ rem: rem, rememberedParent: rememberedParent }];
		}
	}
}

async function acceptOmniRem(todoRems: TodoRems, rem: Rem, rememberedParent?: Rem) {
	if (todoRems['omni']) {
		todoRems['omni'].push({ rem: rem, rememberedParent: rememberedParent });
	} else {
		todoRems['omni'] = [{ rem: rem, rememberedParent: rememberedParent }];
	}
	return todoRems;
}

async function processRem(
	plugin: ReactRNPlugin,
	remId: any,
	todoRems: TodoRems,
	dailyDocument: Rem | null,
	rememberedParent: Rem | undefined = undefined,
	isOmniRem: boolean = false
) {
	const rem: Rem | undefined = await plugin.rem.findOne(remId);

	if (!isOmniRem && dailyDocument) {
		if (rem && (await isUnfinishedTodo(rem))) {
			if (await rememberedParent?.hasPowerup('doNotRollover')) {
				return;
			}
			if (await rem.hasPowerup('doNotRollover')) {
				return;
			}
			if (rememberedParent) {
				await acceptTodoRem(dailyDocument!, todoRems, rem, rememberedParent);
			} else {
				await acceptTodoRem(dailyDocument!, todoRems, rem);
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
	} else if (isOmniRem) {
		if (rem && (await isUnfinishedTodo(rem))) {
			if (await rememberedParent?.hasPowerup('doNotRollover')) {
				return;
			}
			if (await rem.hasPowerup('doNotRollover')) {
				return;
			}
			if (rememberedParent) {
				await acceptOmniRem(todoRems, rem, rememberedParent);
			} else {
				await acceptOmniRem(todoRems, rem);
			}
			return;
		}

		if (rem && (await isFinishedTodo(rem))) {
			return;
		}

		if (rem?.children) {
			for (const childId of rem.children) {
				await processRem(plugin, childId, todoRems, null, rem, true);
			}
		}
	}
}
export async function handleUnfinishedTodos(plugin: ReactRNPlugin) {
	let parentRemsAlreadyRolledOver: Rem[] = [];
	let dateLimit: number = await plugin.settings.getSetting('dateLimit');
	const dailyDocumentPowerup = await plugin.powerup.getPowerupByCode(
		BuiltInPowerupCodes.DailyDocument
	);
	const dailyDocuments = await dailyDocumentPowerup?.taggedRem();
	const portalMode = await plugin.settings.getSetting('portal-mode');

	const todoRems: TodoRems = {};
	// handle if daily document is undefined and if todoRem is undefined
	if (!dailyDocumentPowerup) {
		return;
	}

	if (!dailyDocuments) {
		return;
	}

	const timeStampSlot = await plugin.powerup.getPowerupSlotByCode(
		BuiltInPowerupCodes.DailyDocument,
		'Timestamp'
	);
	for (const dailyDocument of dailyDocuments) {
		const timeStampValue = await dailyDocument.getTagPropertyValue(timeStampSlot!._id);
		const createdAt = new Date(Number(timeStampValue) * 1000);
		const daysAgo: number = howLongAgo(createdAt);
		if (daysAgo > dateLimit) {
			continue;
		}
		await processRem(plugin, dailyDocument._id, todoRems, dailyDocument);
	}

	const omniRem = await plugin.powerup.getPowerupByCode('omniRollover');
	const omniRems = await omniRem?.taggedRem();

	for (const omniRem of omniRems || []) {
		await processRem(plugin, omniRem._id, todoRems, null, undefined, true);
	}

	const todayDailyDocument = await plugin.date.getTodaysDoc();
	if (!todayDailyDocument) {
		console.info('Sorry. No daily document for TODAY has been created.');
		return;
		// we can handle whether the user wants to create a daily document if it doesn't exist. This is optional because ya know, maybe they don't want to create a daily document. It'll just be waiting in that doc until its made.
	}

	if (Object.keys(todoRems).length > 0) {
		await plugin.app.toast("Moving unfinished todos to today's Daily Document.");
		for (const dateString in todoRems) {
			// dateString can also be 'omni'
			let copiedParent: Rem | undefined = undefined;
			if (portalMode) {
				// const groupPortals = await plugin.settings.getSetting('group-portals');
				if (
					todoRems[dateString][0].rememberedParent &&
					parentRemsAlreadyRolledOver.includes(todoRems[dateString][0].rememberedParent!)
				) {
					continue;
				}

				const newPortal = await plugin.rem.createPortal();
				await newPortal?.addPowerup('rolled');
				if (!newPortal) {
					continue;
				}
				await plugin.rem.moveRems([newPortal], todayDailyDocument, 0);
				for (const todoRem of todoRems[dateString]) {
					const rememberedParent = todoRem.rememberedParent;

					if (dateString === 'omni') {
						await todoRem?.rem.addToPortal(newPortal);
					}

					if (rememberedParent) {
						const isDailyDoc = await rememberedParent.hasPowerup(
							BuiltInPowerupCodes.DailyDocument
						);
						if (!isDailyDoc) {
							await todoRem?.rememberedParent?.addToPortal(newPortal);
						}
						await plugin.rem.moveRems(
							[todoRem.rem],
							rememberedParent,
							(rememberedParent.children ?? []).length
						);
						await todoRem?.rem.addToPortal(newPortal);
					}
				}
			} else if (!portalMode) {
				if (dateString === 'omni') {
					await plugin.app.toast(
						'The Omni Rollover feature is not safe when Portal Mode is off.'
					);
					continue;
				}
				if (
					todoRems[dateString][0].rememberedParent &&
					!parentRemsAlreadyRolledOver.includes(todoRems[dateString][0].rememberedParent!)
				) {
					copiedParent = await plugin.rem.createRem();
					await copiedParent?.addPowerup('rolled');
				}
				if (!copiedParent) {
					continue;
				}
				await copiedParent.setText(
					todoRems[dateString][0].rememberedParent!.text || ['Untitled Rem']
				);
				await plugin.rem.moveRems([copiedParent], todayDailyDocument, 0);
				for (const todoRem of todoRems[dateString]) {
					await plugin.rem.moveRems(
						[todoRem.rem],
						copiedParent,
						(copiedParent.children ?? []).length
					);
				}
			}
			if (todoRems[dateString][0].rememberedParent) {
				parentRemsAlreadyRolledOver.push(todoRems[dateString][0].rememberedParent!);
			}
		}
	} else if (Object.keys(todoRems).length === 0) {
		await plugin.app.toast('No unfinished todos to rollover.');
	} else if (Object.keys(todoRems).length < 0) {
		await plugin.app.toast('Something went wrong. ... very wrong 😅');
	}

	return todoRems;
}
