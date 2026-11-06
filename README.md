# CEFR Word Games — Taboo, Hot Seat & Taboo Online

Vocabulary games sharing ~950 English CEFR cards (A1–C2), ~210 Korean cards (TOPIK 1–6) and ~1,680 cards from 14 Simson Rainbow-level textbooks, running as a Cloudflare Worker. The home page (`/`) lets you pick a game.

## Taboo Online (`/online.html`)

Everyone plays on their own phone or laptop, from anywhere. One person creates a room and shares the 4-letter code or the invite link.

- **Co-op:** everyone is on one side with a shared score. Players take turns explaining while the others guess, and the room remembers your best score. Built for language partners: each player picks the language they explain in (English or 한국어) and their own decks.
- **Teams:** 2–4 teams take turns. The explainer's teammates guess; the other teams see the card and can press **Taboo!** if a taboo word slips out.
- Only the explainer (and, in team games, the other teams) can see the card. The guessers' screens never receive it.
- Same rules as classroom Taboo: timer, skip rules, taboo penalty, rounds (0 = until you end it), a review list anyone can fix, and score nudges.
- The screens can be shown in English or 한국어 (EN / 한국어 toggle at the top). Each player chooses their own.
- If you close the page or lose signal, open the link again to rejoin as the same player.

How it works: `src/worker.js` runs only for `/api/*`. Each room code is one Durable Object (`Room`) that holds the game and talks to the players over WebSockets. The rules live in `public/js/online-engine.js`, which both the server and the browser use. Rooms are deleted 3 days after their last action.

## Korean decks

`public/js/korean.js` holds one deck per TOPIK level (K1–K6), in the same `단어: 금지어, 금지어, 금지어` format. They show up in every game's deck picker under **한국어**. Run `npm run check` after editing.

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

Both windows must be in the **same browser on the same computer** — they sync instantly with no server.

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

Static files are served straight from `./public`. Only `/api/*` runs the Worker script (`src/worker.js`), which hosts Taboo Online rooms using a SQLite-backed Durable Object. That works on the free Workers plan, and the first deploy creates it automatically from the `migrations` block in `wrangler.jsonc`.

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
