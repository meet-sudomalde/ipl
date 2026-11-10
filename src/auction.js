import {
  PURSE,
  MAX_SQUAD,
  MIN_SQUAD,
  MAX_OVERSEAS,
  MIN_BASE_PRICE,
  TEAMS,
  PLAYERS,
} from './data.js';

const playerById = new Map(PLAYERS.map((pl) => [pl.id, pl]));
export const getPlayer = (id) => playerById.get(id);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashToUnit(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export function formatAmount(lakhs) {
  if (lakhs >= 100) {
    const cr = lakhs / 100;
    return `₹${Number.isInteger(cr) ? cr : cr.toFixed(2).replace(/0$/, '')} Cr`;
  }
  return `₹${lakhs} L`;
}

export function increment(bid) {
  if (bid < 100) return 5;
  if (bid < 200) return 10;
  if (bid < 500) return 20;
  return 25;
}

export function nextBidAmount(lot) {
  if (lot.bid === null) return getPlayer(lot.playerId).basePrice;
  return lot.bid + increment(lot.bid);
}

// A team must keep enough purse to fill its remaining minimum squad slots at base price.
export function maxBid(team) {
  const slotsLeftAfterThis = Math.max(0, MIN_SQUAD - (team.squad.length + 1));
  return team.purse - slotsLeftAfterThis * MIN_BASE_PRICE;
}

export function overseasCount(team) {
  return team.squad.filter((s) => getPlayer(s.playerId).overseas).length;
}

export function bidBlockReason(state, teamId) {
  if (state.phase !== 'auction' || !state.lot) return 'No player on the block';
  const team = state.teams.find((t) => t.id === teamId);
  const player = getPlayer(state.lot.playerId);
  if (state.lot.bidder === teamId) return 'Highest bidder';
  if (team.squad.length >= MAX_SQUAD) return 'Squad full';
  if (player.overseas && overseasCount(team) >= MAX_OVERSEAS) return 'Overseas limit';
  if (nextBidAmount(state.lot) > maxBid(team)) return 'Not enough purse';
  return null;
}

function orderPlayers(rng) {
  const groups = new Map();
  for (const pl of PLAYERS) {
    if (!groups.has(pl.basePrice)) groups.set(pl.basePrice, []);
    groups.get(pl.basePrice).push(pl.id);
  }
  return [...groups.keys()]
    .sort((a, b) => b - a)
    .flatMap((price) => shuffle(groups.get(price), rng));
}

function shuffle(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const openLot = (playerId) => ({ playerId, bid: null, bidder: null, bids: [] });

export function createAuction({ humanTeamIds, seed = Date.now() }) {
  const rng = mulberry32(seed);
  const queue = orderPlayers(rng);
  return {
    phase: 'auction',
    seed,
    round: 1,
    teams: TEAMS.map((t) => ({
      ...t,
      human: humanTeamIds.includes(t.id),
      purse: PURSE,
      squad: [],
    })),
    queue,
    lotIndex: 0,
    lot: openLot(queue[0]),
    results: {},
    log: [],
  };
}

export function placeBid(state, teamId) {
  if (bidBlockReason(state, teamId)) return state;
  const amount = nextBidAmount(state.lot);
  return {
    ...state,
    lot: {
      ...state.lot,
      bid: amount,
      bidder: teamId,
      bids: [...state.lot.bids, { teamId, amount }],
    },
  };
}

export function hammer(state) {
  if (state.phase !== 'auction' || !state.lot) return state;
  const { playerId, bid, bidder } = state.lot;
  const sold = bidder !== null;
  const teams = sold
    ? state.teams.map((t) =>
        t.id === bidder
          ? { ...t, purse: t.purse - bid, squad: [...t.squad, { playerId, price: bid }] }
          : t,
      )
    : state.teams;
  const results = {
    ...state.results,
    [playerId]: sold ? { teamId: bidder, price: bid } : { unsold: true },
  };
  const log = [{ playerId, teamId: bidder, price: bid, round: state.round }, ...state.log];
  const lotIndex = state.lotIndex + 1;
  const done = lotIndex >= state.queue.length;
  return {
    ...state,
    teams,
    results,
    log,
    lotIndex,
    phase: done ? 'complete' : 'auction',
    lot: done ? null : openLot(state.queue[lotIndex]),
  };
}

export function unsoldPlayerIds(state) {
  return Object.entries(state.results)
    .filter(([, r]) => r.unsold)
    .map(([id]) => Number(id));
}

export function reauctionUnsold(state) {
  const queue = unsoldPlayerIds(state);
  if (queue.length === 0) return state;
  const results = { ...state.results };
  for (const id of queue) delete results[id];
  return {
    ...state,
    phase: 'auction',
    round: state.round + 1,
    queue,
    lotIndex: 0,
    lot: openLot(queue[0]),
    results,
  };
}

const ROLE_TARGETS = { Batter: 6, Wicketkeeper: 2, 'All-rounder': 5, Bowler: 7 };

export function aiValuation(state, team, player) {
  const star = Math.max(0, player.rating - 65) ** 2 * 1.2;
  const noise = 0.75 + hashToUnit(`${state.seed}:${team.id}:${player.id}`) * 0.55;
  const haveRole = team.squad.filter((s) => getPlayer(s.playerId).role === player.role).length;
  let need = 1;
  if (haveRole === 0) need = 1.2;
  else if (haveRole >= ROLE_TARGETS[player.role]) need = 0.5;
  if (team.squad.length >= MIN_SQUAD) need *= 0.6;
  const roundFactor = state.round > 1 ? 0.7 : 1;
  return Math.round((player.basePrice + star) * noise * need * roundFactor);
}

export function aiPickBidder(state, rng = Math.random) {
  if (state.phase !== 'auction' || !state.lot) return null;
  const player = getPlayer(state.lot.playerId);
  const amount = nextBidAmount(state.lot);
  const keen = state.teams.filter(
    (t) =>
      !t.human &&
      !bidBlockReason(state, t.id) &&
      amount <= aiValuation(state, t, player),
  );
  if (keen.length === 0) return null;
  return keen[Math.floor(rng() * keen.length)].id;
}
