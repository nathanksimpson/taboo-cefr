# CEFR Word Games — Taboo & Hot Seat

Two classroom vocabulary games sharing ~950 CEFR cards (A1–C2) plus ~1,680 cards from 14 Simson Rainbow-level textbooks, built to run as a static Cloudflare Worker. The home page (`/`) lets you pick a game.

## Book decks

`public/js/books/` holds one deck per textbook, labelled *Book · Level* (e.g. *Write Now 3 · Navy*), with `# Unit …` headings so each card keeps its unit:

| Level | Books |
|---|---|
| Red | Hand in Hand 1 |
| Orange | Hand in Hand 2 |
| Yellow | Hand in Hand 3 |
| Green | Early Writers 1, The Best Writing Starter 1, Write Now 1, Write Right 1 |
| Blue | Early Writers 2, The Best Writing Starter 2, Write Now 2 |
| Navy | Early Writers 3, The Best Writing Starter 3, Write Now 3, Write Right 3 |

The deck picker can filter by level, search, sort (level order, A–Z, most cards) and select a whole level at once. Run `node scripts/check-books.mjs` after editing a book file.

## Deck builder

In either game's Decks panel, **My decks → ＋ New deck** opens the deck builder:

- Name the deck (e.g. *Week 10 Review*).
- **Add words:** pick a book or CEFR level, narrow to a unit, then add single words or **Add all shown**. The search box looks across every deck.
- **Your own word:** write a word plus taboo words; it belongs to that deck only.
- A word already in the deck can't be added twice (even from another book).
- Use ✎ on a deck tile to edit it later, or **Delete deck**.

Decks are saved in the browser; **Cards → Export/Import** carries them to another computer.

## Hot Seat / Who Am I? (`/hotseat.html`)

One student sits facing away from the screen; everyone else can see the word.

- **Hot Seat** style: the team describes the word (no saying it, spelling it or using Korean).
- **Who Am I?** style: the hot-seat student asks yes/no questions; the class answers only yes, no or maybe.
- Correct / Pass / Rule broken buttons (Space, S, X), Undo (Z), Pause (P), editable review after each turn.
- Passes: free, always −1, or N free per turn then −1. Rule broken: −1 or no penalty. 1–6 teams.
- Optional harder mode shows 3 "don't say" words under the word.
- **One screen is fine:** the controller shows the word large, so you can mirror an iPad straight to the projector. On a PC with two screens, **⧉ Class view** opens a projector-only window.

## Taboo (`/taboo.html`)

- **Explainer view** (`/taboo.html`) — setup, the card with its taboo words, and the Correct / Taboo / Skip buttons. This is the screen the explaining student holds or sits at.
- **Class view** (`/class.html`) — open it with the **⧉ Class view** button and drag that window to the projector. It shows the team, a big countdown ring, the turn tally, flashes for Correct / TABOO / Skip, and the scoreboard. It never shows the card while a turn is running.

Both windows must be in the **same browser on the same computer** — they sync instantly with no server. For other devices, use an online room (below).

### Editions (Classroom and Nadu)

One codebase, two front doors. `public/js/edition.js` holds each edition's name, colours and features, and the site picks one from the address it's opened at:

- **Classroom** (default, e.g. `taboo-cefr.…workers.dev`) — for teaching: CEFR levels plus the Simson book decks.
- **Nadu** (any address containing "nadu") — for playing at home: no book decks, its own name and colours. Nadu-Taboo's extras (Korean decks, choosing your language, co-op) move into this edition in later steps.

Preview the other edition on any address with `?edition=nadu` or `?edition=classroom` (it sticks for that tab). To add a difference between editions, add a feature to both in `edition.js` and check `EDITION.features.…` where it matters.

### Playing online (phones, or players in different places)

Press **🌐 Online → Start online room** on the Taboo screen. You get a 4-letter room code; players open **/join** (there's a link on the home page), type the code and their name, and pick a team.

- **In class:** keep the Taboo screen and Class view on the projector. Each turn, the next player on the team explains — the card shows on *their* phone with Correct / Taboo / Skip buttons. The Class view shows the join code between turns.
- **Apart (e.g. on a video call):** everyone joins from their own device. The explainer and the other teams see the card (the other teams get a big **Taboo!** buzzer); the guessing team only sees the timer. If you're playing too, set **This screen is → Player on …** so your screen hides the card when your team guesses.
- **Big screen on another device:** `/class.html?room=CODE`, or pick it from the team picker.
- **Edit teams in the Online panel** at any time, even mid-game: drag players between teams (or select one and press ← →), type over a team's name to rename it, 🔀 **Shuffle players** into even teams, and add or remove teams between games. Players' devices update straight away.
- Change who explains on the *Up next* screen. Reloading or a phone going to sleep rejoins automatically.
- The teacher's screen still runs the game (decks, scores, timer), so keep it open. Rooms are cleared 3 days after everyone leaves; **Close room** ends one straight away.

**Hot Seat / Who Am I? online** works the same way: **🌐 Online** on the Hot Seat screen (or **Host online** on the home page). Each turn the next player on the team takes the hot seat — their device hides the word while everyone else's shows it. In Hot Seat their teammates press Correct / Pass on their phones; in Who Am I? anyone else can. Anyone who sees the word can call **Rule broken**. The big screen (`/hotseat-class.html?room=CODE`) shows the word as usual, so the hot seat faces away from it in class.

Taboo and Hot Seat share one room: switch games on your computer and everyone's devices (and the big screen) follow, with no need to rejoin.

The room is a small Worker + Durable Object in `src/worker.js` (free plan is fine). It never sees the deck, and it removes the card from what it sends to anyone who shouldn't see it.

### Setup options
- Pick any mix of card sets: A1, A2, B1, B2, C1, C2 and **My cards**
- 2–6 teams with your own names
- Turn timer: 30s / 45s / 1 min / 1.5 min / 2 min or any number of seconds
- Skips: free, always −1, or *N free per turn then −1*
- Taboo word said: −1 or no penalty
- Game length: a set number of turns per team, or play until you press End game
- Show the turn's words on the class view when time runs out (good for review)

### During play
| Key | Action |
|---|---|
| Space / Enter / → | Correct |
| X | Taboo! |
| S | Skip |
| Z | Undo last |
| P | Pause / resume |
| F (class view) | Full screen |

- **Too hard — remove this card for good** takes the card out of every future game.
- After each turn you get a review list — tap ✓ ✕ ↷ to fix any mis-taps before the points are added.
- Scores can be nudged with the − / + buttons at any time.

### Managing cards
**Cards** (top right in either game) opens the shared card manager: browse each level, search, untick cards to exclude them, add your own cards to any level or to *My cards*, and **Export / Import** a JSON file to move your cards and exclusions to another computer. These are saved in the browser's local storage.

To change the built-in decks, edit `public/js/cards.js` (one card per line: `word: taboo, taboo, taboo`) and run `npm run check` to catch duplicates.

## Deploying to Cloudflare

The static files are served as assets; `src/worker.js` only handles `/api/*` for online rooms (one Durable Object per room — see `wrangler.jsonc`).

**Option A — connected to GitHub (auto-deploys on every push)**
1. Push this repo to GitHub.
2. Cloudflare dashboard → **Workers & Pages → Create → Import a repository** → pick the repo.
3. Leave the defaults (deploy command `npx wrangler deploy`) and click **Deploy**. You'll get `taboo-cefr.<your-subdomain>.workers.dev`.

**Option B — from your computer**
```bash
npm install
npx wrangler login
npm run deploy
```

Local preview: `npm run dev` then open http://localhost:8787.
