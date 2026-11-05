// All book decks, in level order (Red → Navy).
import { HIH } from './hih.js';
import { EW } from './ew.js';
import { TBW } from './tbw.js';
import { WN } from './wn.js';
import { WR } from './wr.js';

export const LEVEL_ORDER = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Navy'];
export const LEVEL_COLORS = { Red: '#ff5a4e', Orange: '#ff8a3d', Yellow: '#ffc61a', Green: '#1fb36b', Blue: '#6b9bff', Navy: '#2b3a8f' };

const all = [...HIH, ...EW, ...TBW, ...WN, ...WR];
export const BOOKS = LEVEL_ORDER.flatMap((lvl) => all.filter((b) => b.level === lvl));
