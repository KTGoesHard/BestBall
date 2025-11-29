/**
 * BestBall drafting helper with diversification-friendly recommendations.
 */
class BestBallTool {
  constructor(players, options = {}) {
    this.players = players.map((player) => this.#normalizePlayer(player));
    this.options = {
      rosterConfig: options.rosterConfig || {
        QB: 2,
        RB: 5,
        WR: 7,
        TE: 3,
        FLEX: 1,
      },
      adpWeight: options.adpWeight ?? 0.25,
      scarcityWeight: options.scarcityWeight ?? 0.6,
      exposureWeight: options.exposureWeight ?? 0.8,
      leagueConfig: {
        teams: options.leagueConfig?.teams ?? 12,
        rounds: options.leagueConfig?.rounds ?? 18,
        draftSlot: options.leagueConfig?.draftSlot ?? 1,
        snake: options.leagueConfig?.snake ?? true,
      },
      randomness: {
        enabled: options.randomness?.enabled ?? true,
        stdev: options.randomness?.stdev ?? 0.04,
        seed: options.randomness?.seed,
      },
      targetExposure: options.targetExposure || {},
      defaultTargetExposure: options.defaultTargetExposure ?? 0.22,
    };
  }

  recommendPicks(draftState, draftContext = {}) {
    const pickNumber = this.#resolvePickNumber(draftState);
    const pickNumber = draftState?.pickNumber ?? 1;
    const roster = draftState?.roster || {};
    const exposures = draftContext.exposures || {};
    const totalDrafts = draftContext.totalDrafts || 1;
    const takenPlayerIds = new Set((draftState?.takenPlayers || []).map((p) => this.#toId(p)));

    const recommendations = this.players
      .filter((player) => !takenPlayerIds.has(player.id))
      .map((player) => {
        const score = this.#scorePlayer({
          player,
          pickNumber,
          roster,
          exposures,
          totalDrafts,
        });
        return { ...player, score };
      })
      .sort((a, b) => b.score - a.score);

    return recommendations;
  }

  #scorePlayer({ player, pickNumber, roster, exposures, totalDrafts }) {
    const base = player.projection ?? 0;
    const positionalNeed = this.#positionalNeed(player.position, roster);
    const scarcityBoost = positionalNeed * this.options.scarcityWeight * base;

    const adpEdge = this.#adpEdge(player.adp, pickNumber) * this.options.adpWeight * base;
    const exposurePenalty = this.#exposurePenalty({ player, exposures, totalDrafts }) * base;

    const randomized = this.options.randomness.enabled
      ? this.#applyRandomness(base + scarcityBoost + adpEdge - exposurePenalty, player, pickNumber)
      : base + scarcityBoost + adpEdge - exposurePenalty;

    return randomized;
  }

  #positionalNeed(position, roster) {
    const maxAtPosition = this.options.rosterConfig[position] || 0;
    const current = roster[position] || 0;
    const remaining = Math.max(maxAtPosition - current, 0);

    if (maxAtPosition === 0) return 0;
    return remaining / maxAtPosition;
  }

  #adpEdge(adp, pickNumber) {
    if (!adp || adp <= 0) return 0;
    const edge = (adp - pickNumber) / adp;
    return Math.min(Math.max(edge, -0.3), 0.4);
  }

  #resolvePickNumber(draftState = {}) {
    if (Number.isFinite(draftState.pickNumber)) {
      return Number(draftState.pickNumber);
    }

    const teams = draftState.teams ?? this.options.leagueConfig.teams;
    const draftSlot = draftState.draftSlot ?? this.options.leagueConfig.draftSlot;
    const round = draftState.round ?? 1;
    const snake = draftState.snake ?? this.options.leagueConfig.snake;

    const pickInRound = draftState.pickInRound ?? draftSlot;
    const boundedPickInRound = Math.min(Math.max(1, pickInRound), teams);

    if (!snake) {
      return (round - 1) * teams + boundedPickInRound;
    }

    const isEvenRound = round % 2 === 0;
    const normalizedPick = isEvenRound ? teams - boundedPickInRound + 1 : boundedPickInRound;

    return (round - 1) * teams + normalizedPick;
  }

  #exposurePenalty({ player, exposures, totalDrafts }) {
    const currentShares = exposures[player.id] || 0;
    const target = this.options.targetExposure[player.id] ?? this.options.defaultTargetExposure;
    const currentRate = totalDrafts > 0 ? currentShares / totalDrafts : 0;

    if (currentRate <= target) return 0;
    return (currentRate - target) * this.options.exposureWeight;
  }

  #applyRandomness(value, player, pickNumber) {
    const seed = this.options.randomness.seed;
    const rng = seed
      ? this.#seededGenerator(`${seed}-${player.id}-${pickNumber}`)
      : Math.random;
    const noise = this.#gaussianNoise({ rng, stdev: this.options.randomness.stdev });
    return value * (1 + noise);
  }

  #seededGenerator(seed) {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i += 1) {
      h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }

  #gaussianNoise({ rng, stdev }) {
    const u1 = Math.max(rng(), 1e-9);
    const u2 = rng();
    const mag = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mag * stdev;
  }

  #normalizePlayer(player) {
    const normalized = { ...player };
    normalized.position = player.position?.toUpperCase?.() || "FLEX";
    normalized.id = this.#toId(player.id || `${player.name}-${normalized.position}`);
    normalized.adp = Number(player.adp ?? 0);
    normalized.projection = Number(player.projection ?? 0);
    return normalized;
  }

  #toId(value) {
    return String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}

module.exports = BestBallTool;
