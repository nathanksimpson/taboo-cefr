// Hot Seat bits shared by the controller and the class view.
import { makeSync, settingsStore, sum } from './core.js';

export const sync = makeSync('hotseat.game.v1', 'hotseat-cefr');

const baseSettings = settingsStore('hotseat.settings.v1', {
  style: 'hotseat', // 'hotseat' | 'whoami'
  sets: ['A2', 'B1'],
  seconds: 90,
  passMode: 'limited', // 'free' | 'limited' | 'penalty'
  freePasses: 2,
  foulPenalty: true,
  turnsPerTeam: 0,
  showAvoid: false,
  revealWords: true,
  sounds: true,
  teams: ['Team 1', 'Team 2'],
});

// Rule broken now costs 1 point by default. Saved setups from before this change get it switched on once;
// after that, unticking the box in setup is remembered.
export const hsSettings = {
  get() {
    const s = baseSettings.get();
    if (!s.foulDefaultV2) { s.foulPenalty = true; s.foulDefaultV2 = true; baseSettings.set(s); }
    return s;
  },
  set: baseSettings.set,
};

export const STYLE = {
  hotseat: {
    name: 'Hot Seat',
    seat: 'Hot seat: sit facing away from the screen.',
    rule: 'Describe the word. Don’t say it, spell it or use Korean.',
    foul: 'said the word, spelled it or used Korean',
  },
  whoami: {
    name: 'Who Am I?',
    seat: 'Hot seat: sit facing away from the screen.',
    rule: 'Ask yes/no questions. Class: answer only yes, no or maybe.',
    foul: 'gave more than yes, no or maybe',
  },
};

export function scoreHS(log, s) {
  let passes = 0;
  return log.map((e) => {
    if (e.result === 'correct') return 1;
    if (e.result === 'foul') return s.foulPenalty ? -1 : 0;
    if (e.result === 'pass') {
      passes += 1;
      if (s.passMode === 'penalty') return -1;
      if (s.passMode === 'limited') return passes > s.freePasses ? -1 : 0;
    }
    return 0;
  });
}
export const turnTotal = (log, s) => sum(scoreHS(log, s));

export function passRuleText(s) {
  if (s.passMode === 'free') return 'Passes are free';
  if (s.passMode === 'penalty') return 'Every pass costs 1 point';
  return `${s.freePasses} free pass${s.freePasses === 1 ? '' : 'es'} per turn, then −1 each`;
}
