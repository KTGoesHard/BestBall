# BestBall Draft Helper

A lightweight JavaScript helper that suggests best-ball draft picks while adding small, controlled randomness to diversify player exposure across multiple drafts.

## Features
- Score-based recommendations that combine projections, positional needs, and ADP value.
- Exposure-aware penalties so you can cap how often you draft any player.
- Optional deterministic seeding so identical scenarios produce identical scores, with Gaussian noise for slight pick-to-pick variation.
- Snake-draft aware pick math with configurable team counts and draft slot.
- Single-page snake draft assistant (examples/snake_draft.html) with CSV/JSON import, snake board, pick logging, and Monte Carlo Win% sims.
- Simple API with a reference demo.

## Installation
```
npm install
```

## Usage
```js
const BestBallTool = require('./src/bestball');

const players = [
  { name: 'Patrick Mahomes', position: 'QB', adp: 8, projection: 370 },
  { name: 'Justin Jefferson', position: 'WR', adp: 2, projection: 330 },
  // ...more players
];

const advisor = new BestBallTool(players, {
  rosterConfig: { QB: 2, RB: 5, WR: 7, TE: 3, FLEX: 1 },
  leagueConfig: { teams: 12, rounds: 18, draftSlot: 6, snake: true },
  adpWeight: 0.3,
  randomness: { enabled: true, stdev: 0.03, seed: 'my-draft-room' },
  targetExposure: { 'patrick-mahomes-qb': 0.18 },
  defaultTargetExposure: 0.2,
});

const draftState = {
  round: 2,
  draftSlot: 6,
  roster: { QB: 0, RB: 1, WR: 1, TE: 0 },
  takenPlayers: ['Christian McCaffrey'],
};

const draftContext = {
  exposures: { 'patrick-mahomes-qb': 3 },
  totalDrafts: 10,
};

const recommendations = advisor.recommendPicks(draftState, draftContext);
console.log(recommendations.slice(0, 5));
```

### Draft math
- If you omit `pickNumber`, the helper computes overall pick from `round`, `draftSlot`, and `teams` using snake logic (`round` defaults to `1`, `snake` defaults to `true`).
- Provide `draftState.pickNumber` explicitly if you want to override the calculation.

## Diversification knobs
- `targetExposure` / `defaultTargetExposure`: reduce scores for players you are drafting too often.
- `randomness.stdev`: increase for more variety (0.02–0.05 is typical), or set `enabled: false` for deterministic scores.
- `randomness.seed`: provide when you want reproducible randomness during sims.
- `leagueConfig`: set `teams`, `rounds`, `draftSlot`, and `snake` to mirror your draft room defaults.

## Snake draft assistant (browser)
Open `examples/snake_draft.html` in a browser for a single-page tool that mirrors the mini best ball workflow:
- Configure teams (1–12), rounds (4–12), and your slot; reset clears the saved state. The header stays sticky so controls remain visible while scrolling.
- Import players from CSV/JSON via file, drag & drop, or paste; auto-detects columns with editable mapping and normalizes positions (QB/RB/WR/TE only). The importer now understands richer DraftKings-style columns (e.g., `player`, `team`, `pos`, `DK_PPG_mu`, `DK_PPG_anchor`, stat-level `RecYds_mu`/`RecYds_sd`, etc.) and will derive PPG/SD when direct columns are absent.
- Redesigned layout that mirrors the reference UI: a left rail for DK-aware imports and the remaining board, and a right rail with a highlighted draft board/status, compact log-pick card, and side-by-side simulation cards.
- Autosaves the board, picks, and pool to `localStorage` so reopening reloads your draft room.
- Renders a snake draft board, remaining ADP list (top 160), pick logging buttons, undo, and recent log. The log input now autocompletes against every loaded player name, so you can type a few letters and select the player instead of retyping full names.
- Monte Carlo “Win% — current pick” with knobs for sims, shortlist size, variance, QB weight, ADP gate, and minimum round for QB2.
- “Final Win% — all teams” sim that autofills each team to 7 players (mini roster) and reports win chances.

### CSV/JSON import details
- Column auto-detection now checks `DK_PPG_mu`, `DK_PPG_anchor`, `dk_ppg` variants, and `dk_ppg_sd` / `dk_pts_sd` when present.
- If no explicit PPG/SD columns exist, the tool derives them using the provided stat means/sds with DraftKings scoring weights (Receptions 1, Rec/Rush yards 0.1 per yard, Rec/Rush TD 6, Pass yards 0.04, Pass TD 4, INT −1) so richer data like the sample excerpt above produces accurate variance-aware sims.

### Machine learning feedback loop
- Each time you run “Final Win% — all teams,” the tool records your team’s simulated win rate versus baseline expectations for the league size and assigns a small win-lift signal to every player you drafted (exponential moving average with decay and a cap of the last 50 drafts).
- Those learned win-lift signals adjust the current-pick shortlist by nudging player PPG up/down (bounded) before the Monte Carlo run, so repeat successes subtly surface earlier while underperformers slide.
- The learned signals, history count, and strongest observed lift are displayed under the Log Picks card; everything is stored locally in `localStorage`, keeping the feedback loop lightweight and privacy-friendly.

## Running the demo
```
npm test
```
