import { Rem } from '@remnote/plugin-sdk';

export interface TodoRem {
	rem: Rem;
	rememberedParent: Rem | undefined;
	isCompleted?: boolean;
}
export interface TodoRems {
	[date: string]: TodoRem[];
}
