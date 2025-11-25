# BestBall Draft Helper

A lightweight JavaScript helper that suggests best-ball draft picks while adding small, controlled randomness to diversify player exposure across multiple drafts.

## Features
- Score-based recommendations that combine projections, positional needs, and ADP value.
- Exposure-aware penalties so you can cap how often you draft any player.
- Optional deterministic seeding so identical scenarios produce identical scores, with Gaussian noise for slight pick-to-pick variation.
- Snake-draft aware pick math with configurable team counts and draft slot.
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

## Running the demo
```
npm test
```
