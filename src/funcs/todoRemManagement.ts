import { BuiltInPowerupCodes, ReactRNPlugin, Rem } from '@remnote/plugin-sdk';
import { TodoRems } from '../types/TodoRem';
import { hasHappened, howLongAgo, isFinishedTodo, isUnfinishedTodo } from './calculations';

async function acceptTodoRem(
	dailyDocument: Rem,
	todoRems: TodoRems,
	rem: Rem,
	rememberedParent?: Rem,
	isCompleted: boolean = false
) {
	const timestamp: string = await dailyDocument.getPowerupProperty(
		BuiltInPowerupCodes.DailyDocument,
		'Timestamp'
	);
	const date = new Date(Number(timestamp) * 1000);

	if (hasHappened(date)) {
		if (todoRems[timestamp]) {
			todoRems[timestamp].push({ rem: rem, rememberedParent: rememberedParent, isCompleted: isCompleted });
		} else {
			todoRems[timestamp] = [{ rem: rem, rememberedParent: rememberedParent, isCompleted: isCompleted }];
		}
	}
}

async function acceptOmniRem(todoRems: TodoRems, rem: Rem, rememberedParent?: Rem, isCompleted: boolean = false) {
	if (todoRems['omni']) {
		todoRems['omni'].push({ rem: rem, rememberedParent: rememberedParent, isCompleted: isCompleted });
	} else {
		todoRems['omni'] = [{ rem: rem, rememberedParent: rememberedParent, isCompleted: isCompleted }];
	}
	return todoRems;
}

async function processRem(
	plugin: ReactRNPlugin,
	remId: any,
	todoRems: TodoRems,
	dailyDocument: Rem | null,
	rememberedParent: Rem | undefined = undefined,
	isOmniRem: boolean = false,
	retainCompletedTodos: boolean = true
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
				await acceptTodoRem(dailyDocument!, todoRems, rem, rememberedParent, false);
			} else {
				await acceptTodoRem(dailyDocument!, todoRems, rem, undefined, false);
			}
			return;
		}

		if (rem && (await isFinishedTodo(rem))) {
			// Include completed todos to preserve them as portals in original daily documents
			// only if the retain-completed-todos setting is enabled
			if (retainCompletedTodos) {
				if (rememberedParent) {
					await acceptTodoRem(dailyDocument!, todoRems, rem, rememberedParent, true);
				} else {
					await acceptTodoRem(dailyDocument!, todoRems, rem, undefined, true);
				}
			}
			return;
		}

		if (rem?.children) {
			for (const childId of rem.children) {
				await processRem(plugin, childId, todoRems, dailyDocument, rem, false, retainCompletedTodos);
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
				await acceptOmniRem(todoRems, rem, rememberedParent, false);
			} else {
				await acceptOmniRem(todoRems, rem, undefined, false);
			}
			return;
		}

		if (rem && (await isFinishedTodo(rem))) {
			// Include completed todos to preserve them as portals in original locations
			// only if the retain-completed-todos setting is enabled
			if (retainCompletedTodos) {
				if (rememberedParent) {
					await acceptOmniRem(todoRems, rem, rememberedParent, true);
				} else {
					await acceptOmniRem(todoRems, rem, undefined, true);
				}
			}
			return;
		}

		if (rem?.children) {
			for (const childId of rem.children) {
				await processRem(plugin, childId, todoRems, null, rem, true, retainCompletedTodos);
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
	const retainCompletedTodos = await plugin.settings.getSetting('retain-completed-todos');

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
		await processRem(plugin, dailyDocument._id, todoRems, dailyDocument, undefined, false, retainCompletedTodos);
	}

	const omniRem = await plugin.powerup.getPowerupByCode('omniRollover');
	const omniRems = await omniRem?.taggedRem();

	for (const omniRem of omniRems || []) {
		await processRem(plugin, omniRem._id, todoRems, null, undefined, true, retainCompletedTodos);
	}

	const todayDailyDocument = await plugin.date.getTodaysDoc();
	if (!todayDailyDocument) {
		console.info('Sorry. No daily document for TODAY has been created.');
		return;
		// we can handle whether the user wants to create a daily document if it doesn't exist. This is optional because ya know, maybe they don't want to create a daily document. It'll just be waiting in that doc until its made.
	}

	if (Object.keys(todoRems).length > 0) {
		if (retainCompletedTodos) {
			await plugin.app.toast("Processing todos for rollover and preserving completed ones.");
		} else {
			await plugin.app.toast("Processing todos for rollover.");
		}
		for (const dateString in todoRems) {
			// dateString can also be 'omni'
			
			// Separate completed and unfinished todos
			const unfinishedTodos = todoRems[dateString].filter(todo => !todo.isCompleted);
			const completedTodos = todoRems[dateString].filter(todo => todo.isCompleted);
			
			// Handle completed todos - preserve them as portals in their original daily documents
			if (portalMode && retainCompletedTodos && completedTodos.length > 0 && dateString !== 'omni') {
				// Find the original daily document by timestamp
				let originalDailyDocument = null;
				for (const doc of dailyDocuments) {
					const timeStampValue = await doc.getTagPropertyValue(timeStampSlot!._id);
					if (String(timeStampValue) === dateString) {
						originalDailyDocument = doc;
						break;
					}
				}
				
				if (originalDailyDocument) {
					for (const completedTodo of completedTodos) {
						// Ensure completed todo remains as a portal in its original daily document
						if (completedTodo.rememberedParent) {
							await completedTodo.rem.addToPortal(originalDailyDocument);
						}
					}
				}
			}
			
			// Handle unfinished todos - roll them over to today's daily document
			if (unfinishedTodos.length === 0) {
				continue; // No unfinished todos to roll over
			}
			
			let copiedParent: Rem | undefined = undefined;
			if (portalMode) {
				// const groupPortals = await plugin.settings.getSetting('group-portals');
				if (
					unfinishedTodos.length > 0 &&
					unfinishedTodos[0].rememberedParent &&
					parentRemsAlreadyRolledOver.includes(unfinishedTodos[0].rememberedParent!)
				) {
					continue;
				}

				const newPortal = await plugin.rem.createPortal();
				await newPortal?.addPowerup('rolled');
				if (!newPortal) {
					continue;
				}
				await plugin.rem.moveRems([newPortal], todayDailyDocument, 0);
				for (const todoRem of unfinishedTodos) {
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
				// Handle completed todos in non-portal mode - leave them in their original locations
				if (retainCompletedTodos && completedTodos.length > 0 && dateString !== 'omni') {
					// In non-portal mode, completed todos should remain in their original daily documents
					// No action needed as they're already in the right place
				}
				
				if (dateString === 'omni') {
					await plugin.app.toast(
						'The Omni Rollover feature is not safe when Portal Mode is off.'
					);
					continue;
				}
				if (
					unfinishedTodos.length > 0 &&
					unfinishedTodos[0].rememberedParent &&
					!parentRemsAlreadyRolledOver.includes(unfinishedTodos[0].rememberedParent!)
				) {
					copiedParent = await plugin.rem.createRem();
					await copiedParent?.addPowerup('rolled');
				}
				if (!copiedParent) {
					continue;
				}
				await copiedParent.setText(
					unfinishedTodos[0].rememberedParent!.text || ['Untitled Rem']
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
			if (unfinishedTodos.length > 0 && unfinishedTodos[0].rememberedParent) {
				parentRemsAlreadyRolledOver.push(unfinishedTodos[0].rememberedParent!);
			}
		}
	} else if (Object.keys(todoRems).length === 0) {
		await plugin.app.toast('No unfinished todos to rollover.');
	} else if (Object.keys(todoRems).length < 0) {
		await plugin.app.toast('Something went wrong. ... very wrong 😅');
	}

	return todoRems;
}
