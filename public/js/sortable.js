// Drag to reorder with a floating copy under the pointer and the other items sliding out of the way.
// Mouse: grab anywhere on an item except its controls. Touch: grab the handle ([data-drag]),
// so the page still scrolls normally. Keyboard: arrow keys on the handle (onKey).

const MOVE_MS = 180;

/** Animate items from where they were (before) to where they are now. */
function slide(items, before) {
  for (const el of items) {
    const a = before.get(el); if (!a) continue;
    const b = el.getBoundingClientRect();
    const dx = a.left - b.left; const dy = a.top - b.top;
    if (!dx && !dy) continue;
    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    el.getBoundingClientRect(); // apply the jump before animating back
    el.style.transition = `transform ${MOVE_MS}ms cubic-bezier(.2, .8, .2, 1)`;
    el.style.transform = '';
    el.dataset.sliding = '1';
    clearTimeout(el._slideT);
    el._slideT = setTimeout(() => { delete el.dataset.sliding; el.style.transition = ''; }, MOVE_MS);
  }
}

/**
 * root: the list. items: selector for the rows. ignore: parts of a row that keep their own clicks.
 * onDrop(order): order = the rows' original indexes (data-row) in their new order.
 * onChange(): called whenever the order on screen changes (e.g. to renumber).
 * onKey(index, dir): arrow keys on a handle.
 */
export function makeSortable(root, { items, ignore, onDrop, onChange, onKey }) {
  let st = null;

  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || st) return;
    const row = e.target.closest(items);
    if (!row || !root.contains(row)) return;
    const onHandle = !!e.target.closest('[data-drag]');
    if (!onHandle && (e.pointerType !== 'mouse' || e.target.closest(ignore))) return;
    if (onHandle) e.preventDefault();
    st = { row, id: e.pointerId, x0: e.clientX, y0: e.clientY, started: false };
  });

  function begin() {
    const { row } = st;
    const r = row.getBoundingClientRect();
    const ghost = row.cloneNode(true);
    // copy what was typed, which cloneNode doesn't carry over
    const srcInputs = row.querySelectorAll('input');
    ghost.querySelectorAll('input').forEach((inp, i) => { inp.value = srcInputs[i]?.value ?? inp.value; });
    ghost.classList.add('drag-float');
    ghost.removeAttribute('data-row');
    ghost.setAttribute('aria-hidden', 'true');
    Object.assign(ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    document.body.append(ghost);
    row.classList.add('drag-gap');
    root.classList.add('sorting');
    document.body.classList.add('is-dragging');
    st.ghost = ghost; st.started = true;
    requestAnimationFrame(() => ghost.classList.add('lifted'));
  }

  function rows() { return [...root.querySelectorAll(items)]; }

  window.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id) return;
    if (!st.started) {
      if (Math.hypot(e.clientX - st.x0, e.clientY - st.y0) < 5) return;
      begin();
    }
    e.preventDefault();
    st.ghost.style.setProperty('--dx', `${e.clientX - st.x0}px`);
    st.ghost.style.setProperty('--dy', `${e.clientY - st.y0}px`);

    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest(items);
    if (!over || over === st.row || !root.contains(over) || over.dataset.sliding) return;
    const list = rows();
    const from = list.indexOf(st.row); const to = list.indexOf(over);
    const before = new Map(list.map((el) => [el, el.getBoundingClientRect()]));
    if (from < to) over.after(st.row); else over.before(st.row);
    slide(rows().filter((el) => el !== st.row), before);
    onChange?.();
  }, { passive: false });

  function end(e) {
    if (!st || e.pointerId !== st.id) return;
    const s = st; st = null;
    if (!s.started) return;
    const target = s.row.getBoundingClientRect();
    const start = s.ghost.getBoundingClientRect();
    // glide the floating copy into the gap, then swap it for the real row
    s.ghost.classList.remove('lifted');
    s.ghost.classList.add('landing');
    const cur = { x: parseFloat(s.ghost.style.getPropertyValue('--dx')) || 0, y: parseFloat(s.ghost.style.getPropertyValue('--dy')) || 0 };
    s.ghost.style.setProperty('--dx', `${cur.x + (target.left - start.left)}px`);
    s.ghost.style.setProperty('--dy', `${cur.y + (target.top - start.top)}px`);
    setTimeout(() => {
      s.ghost.remove();
      s.row.classList.remove('drag-gap');
      root.classList.remove('sorting');
      document.body.classList.remove('is-dragging');
      const order = rows().map((r) => +r.dataset.row);
      if (order.some((v, i) => v !== i)) onDrop(order); else onChange?.();
    }, 160);
  }
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);

  root.addEventListener('keydown', (e) => {
    const h = e.target.closest('[data-drag]');
    if (!h || !onKey) return;
    const dir = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    onKey(+h.dataset.drag, dir);
  });
}
