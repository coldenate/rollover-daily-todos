import { Rem } from '@remnote/plugin-sdk';

export interface TodoRem {
	rem: Rem;
	rememberedParent: Rem | undefined;
}
export interface TodoRems {
	[date: string]: TodoRem[];
}
