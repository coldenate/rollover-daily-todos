export function hasHappened(date: Date): boolean {
	const today = new Date();

	today.setHours(0, 0, 0, 0);
	date.setHours(0, 0, 0, 0);

	return date < today;
}
export function howLongAgo(date: Date): number {
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
export async function isUnfinishedTodo(rem: any): Promise<boolean> {
	return (await rem.isTodo()) && (await rem.getTodoStatus()) === 'Unfinished';
}
export async function isFinishedTodo(rem: any): Promise<boolean> {
	return (await rem.isTodo()) && (await rem.getTodoStatus()) === 'Finished';
}
