// Team board for online rooms: every team as a box, players as chips.
// Drag a player to another team (or select one and press ← →), type over a team's name to rename it,
// or shuffle everyone into even teams. Used in the lobby and, between turns, from the 👥 Teams button.
import { TEAM_COLORS, esc } from './core.js';
import { teamName, members } from './online-engine.js';

const TXT = {
  en: { shuffle: '🔀 Shuffle teams', hint: 'Drag players between teams, or select one and use ← →. Type over a team’s name to rename it.', empty: 'Drop players here', you: 'you', offline: 'offline', remove: 'Remove', teamName: 'Team name' },
  ko: { shuffle: '🔀 팀 섞기', hint: '플레이어를 끌어서 다른 팀으로 옮기거나, 선택한 뒤 ← → 키를 누르세요. 팀 이름을 눌러 바꿀 수 있어요.', empty: '여기에 놓으세요', you: '나', offline: '오프라인', remove: '내보내기', teamName: '팀 이름' },
};

/**
 * mountTeamBoard(container, { getState, pid, online: () => Set, send, ui: () => 'en'|'ko', langName })
 * Returns render().
 */
export function mountTeamBoard(container, opts) {
  const { getState, pid, send } = opts;
  let drag = null;
  let note = null; // { text, until } — e.g. "every team needs a player"
  const tx = () => TXT[opts.ui()] || TXT.en;

  function render() {
    const s = getState();
    if (!s || drag) return;
    const L = tx();
    const online = opts.online();
    const st = s.settings;
    const ae = document.activeElement;
    const keep = ae && container.contains(ae)
      ? (ae.dataset.rename != null ? { sel: `[data-rename="${ae.dataset.rename}"]`, value: ae.value, a: ae.selectionStart, b: ae.selectionEnd }
        : ae.dataset.pid ? { sel: `[data-pid="${ae.dataset.pid}"]` } : null)
      : null;
    const chip = (p) => {
      const pl = s.players[p];
      const on = online.has(p);
      const mine = p === pid();
      return `<li class="ro-player ${mine ? 'me' : ''}" data-pid="${esc(p)}" tabindex="0">
        <span class="ro-grip" aria-hidden="true">⠿</span>
        <span class="online-dot ${on ? 'on' : ''}" title="${on ? '' : esc(L.offline)}"></span>
        <span class="ro-name">${esc(pl.name)}${mine ? ` <span class="muted">(${esc(L.you)})</span>` : ''}</span>
        <span class="lang-tag ${pl.lang}">${esc(opts.langName(pl.lang))}</span>
        ${!mine && !on && s.phase === 'lobby' ? `<button class="ro-x" data-remove="${esc(p)}" title="${esc(L.remove)}" aria-label="${esc(L.remove)} ${esc(pl.name)}">×</button>` : ''}
      </li>`;
    };
    container.innerHTML = `
      <div class="ro-bar"><button class="btn ghost small" data-shuffle ${s.order.length < 2 ? 'disabled' : ''}>${esc(L.shuffle)}</button></div>
      <div class="ro-grid">${Array.from({ length: st.teamCount }, (_, i) => {
        const ms = members(s, i);
        return `<div class="ro-team" data-tid="${i}" style="--team:${TEAM_COLORS[i]}">
          <div class="ro-head"><span class="dot" style="background:${TEAM_COLORS[i]}"></span>
            <input class="ro-rename" data-rename="${i}" value="${esc(teamName(s, i))}" maxlength="20" aria-label="${esc(L.teamName)}">
            <span class="ro-count">${ms.length}</span></div>
          <ul>${ms.map(chip).join('') || `<li class="ro-empty">${esc(L.empty)}</li>`}</ul></div>`;
      }).join('')}</div>
      ${note && note.until > Date.now() ? `<p class="online-err">${esc(note.text)}</p>` : ''}
      <p class="hint">${esc(L.hint)}</p>`;
    if (keep) {
      const el = container.querySelector(keep.sel);
      if (el) { el.focus(); if (keep.value != null) { el.value = keep.value; el.setSelectionRange(keep.a, keep.b); } }
    }
  }

  const teamOf = (p) => getState()?.players[p]?.team ?? 0;
  const move = (p, team) => { if (team !== teamOf(p)) send({ type: 'assign', pid: p, team }); };

  container.addEventListener('click', (e) => {
    if (e.target.closest('[data-shuffle]')) { send({ type: 'shuffleTeams' }); return; }
    const rb = e.target.closest('[data-remove]');
    if (rb) send({ type: 'remove', pid: rb.dataset.remove });
  });
  let renameT = null;
  container.addEventListener('input', (e) => {
    const i = e.target.dataset.rename;
    if (i == null) return;
    clearTimeout(renameT);
    const name = e.target.value;
    renameT = setTimeout(() => { if (name.trim()) send({ type: 'renameTeam', team: +i, name }); }, 350);
  });
  container.addEventListener('keydown', (e) => {
    if (e.target.dataset.rename != null && e.key === 'Enter') { e.preventDefault(); e.target.blur(); return; }
    const li = e.target.closest?.('.ro-player');
    if (!li || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const n = getState().settings.teamCount;
    move(li.dataset.pid, (teamOf(li.dataset.pid) + (e.key === 'ArrowRight' ? 1 : n - 1)) % n);
  });

  /* Drag: the name floats under the pointer, the team under it lights up. */
  container.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('.ro-player');
    if (!li || e.button !== 0 || e.target.closest('button')) return;
    const r = li.getBoundingClientRect();
    drag = { li, id: li.dataset.pid, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, ghost: null, over: null, pointer: e.pointerId };
  });
  container.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
      drag.ghost = drag.li.cloneNode(true);
      drag.ghost.classList.add('ro-ghost');
      drag.ghost.style.width = `${drag.w}px`;
      (container.closest('dialog') || document.body).appendChild(drag.ghost);
      drag.li.classList.add('ro-dragging');
      document.body.classList.add('ro-is-dragging');
      try { drag.li.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    e.preventDefault();
    drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px) rotate(-2deg)`;
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.ro-team');
    if (over !== drag.over) { drag.over?.classList.remove('ro-over'); over?.classList.add('ro-over'); drag.over = over; }
  });
  const end = (e, cancel) => {
    if (!drag || (e && e.pointerId !== drag.pointer)) return;
    const d = drag; drag = null;
    if (!d.ghost) return;
    d.over?.classList.remove('ro-over');
    document.body.classList.remove('ro-is-dragging');
    const target = d.over?.dataset.tid;
    if (!cancel && target != null && +target !== teamOf(d.id)) {
      d.ghost.remove();
      move(d.id, +target);
      render();
    } else {
      const r = d.li.getBoundingClientRect();
      d.ghost.style.transition = 'transform 160ms ease';
      d.ghost.style.transform = `translate(${r.left}px, ${r.top}px)`;
      setTimeout(() => { d.ghost.remove(); d.li.classList.remove('ro-dragging'); }, 170);
    }
  };
  container.addEventListener('pointerup', (e) => end(e, false));
  container.addEventListener('pointercancel', (e) => end(e, true));

  /** Show a short message on the board (a move the room refused). */
  render.note = (text) => { note = { text, until: Date.now() + 4000 }; render(); setTimeout(render, 4100); };
  return render;
}
