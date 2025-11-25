const BestBallTool = require('../src/bestball');

const players = [
  { name: 'Patrick Mahomes', position: 'QB', adp: 8, projection: 370 },
  { name: 'Jalen Hurts', position: 'QB', adp: 12, projection: 360 },
  { name: 'Christian McCaffrey', position: 'RB', adp: 1, projection: 325 },
  { name: 'Bijan Robinson', position: 'RB', adp: 6, projection: 290 },
  { name: 'Justin Jefferson', position: 'WR', adp: 2, projection: 330 },
  { name: "Ja'Marr Chase", position: 'WR', adp: 3, projection: 325 },
  { name: 'Travis Kelce', position: 'TE', adp: 7, projection: 295 },
];

const advisor = new BestBallTool(players, {
  randomness: { stdev: 0.03 },
  defaultTargetExposure: 0.2,
});

const roster = { QB: 0, RB: 1, WR: 1, TE: 0 };
const takenPlayers = ['Christian McCaffrey'];
const draftState = { pickNumber: 10, roster, takenPlayers };

const exposures = { 'patrick-mahomes-qb': 3, 'ja-marr-chase-wr': 4 };
const draftContext = { exposures, totalDrafts: 10 };

const recommendations = advisor.recommendPicks(draftState, draftContext);

console.log('Top 3 recommendations with diversification and randomness applied:');
console.log(
  recommendations
    .slice(0, 3)
    .map(({ name, position, score }) => `${name} (${position}) -> ${score.toFixed(2)}`),
);
