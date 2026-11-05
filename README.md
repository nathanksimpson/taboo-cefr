# CEFR Word Games — Taboo & Hot Seat

Two classroom vocabulary games sharing ~950 cards sorted by CEFR level (A1–C2, about 150 per level), built to run as a static Cloudflare Worker. The home page (`/`) lets you pick a game.

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

This is an assets-only Worker (see `wrangler.jsonc`) — no server code.

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
