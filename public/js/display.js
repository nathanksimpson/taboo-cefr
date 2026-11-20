// display.html — the class computer. Type the room code from the teacher's phone, then open
// the big screen (timer, scores, results — for the projector) and the card screen (for the monitor
// the explaining student faces). "Open both" opens the card screen in a second window.
import { esc } from './core.js';
import { cleanCode } from './online.js';

const form = document.getElementById('disp-form');
const start = cleanCode(new URLSearchParams(location.search).get('room') || '');
const bigUrl = (c) => `class.html?room=${c}`; // follows the room into Hot Seat by itself
const cardUrl = (c) => `card.html?room=${c}`;

form.innerHTML = `
  <h1 class="join-title">Class computer</h1>
  <p class="hint">Start an online room on your phone (🌐 Online), then type its code here.</p>
  <label class="field">Room code
    <input id="disp-code" class="code-input" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" value="${esc(start)}" required>
  </label>
  <button class="btn primary big" id="disp-both" type="submit">Open both screens ▶</button>
  <div class="disp-two">
    <button class="btn ghost" type="button" data-open="big"><b>📽 Big screen</b><small>Timer, scores and results — for the projector</small></button>
    <button class="btn ghost" type="button" data-open="card"><b>🃏 Card screen</b><small>The card, big — for the monitor the explainer faces</small></button>
  </div>
  <p class="online-err" id="disp-err" hidden></p>
  <p class="hint">“Open both” opens the card screen in a new window: drag it onto the monitor, and this window onto the projector. Press <b>F</b> in each one for full screen.</p>`;

const codeIn = document.getElementById('disp-code');
const err = document.getElementById('disp-err');
codeIn.addEventListener('input', () => { codeIn.value = cleanCode(codeIn.value); err.hidden = true; });
const code = () => {
  const c = cleanCode(codeIn.value);
  if (c.length !== 4) { err.textContent = 'Type the 4-letter room code from your phone.'; err.hidden = false; codeIn.focus(); return null; }
  return c;
};

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const c = code(); if (!c) return;
  const w = window.open(cardUrl(c), `taboo-cards-${c}`, 'popup,width=1100,height=760');
  if (!w) { err.innerHTML = `Your browser blocked the second window. <a href="${cardUrl(c)}" target="_blank" rel="noopener">Open the card screen</a>, then come back and choose Big screen.`; err.hidden = false; return; }
  location.href = bigUrl(c);
});
form.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => {
  const c = code(); if (!c) return;
  location.href = b.dataset.open === 'big' ? bigUrl(c) : cardUrl(c);
}));
codeIn.focus();
