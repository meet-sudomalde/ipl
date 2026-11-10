import { describe, it, expect } from 'vitest';
import {
  createAuction,
  placeBid,
  hammer,
  increment,
  nextBidAmount,
  maxBid,
  bidBlockReason,
  reauctionUnsold,
  unsoldPlayerIds,
  aiPickBidder,
  formatAmount,
  getPlayer,
  validBidAmounts,
  squadRating,
} from './auction.js';
import { PLAYERS, PURSE, MAX_SQUAD, MIN_SQUAD } from './data.js';

const fresh = (humans = ['CSK', 'MI']) => createAuction({ humanTeamIds: humans, seed: 42 });

describe('bid increments', () => {
  it('follows the IPL slabs', () => {
    expect(increment(50)).toBe(5);
    expect(increment(150)).toBe(10);
    expect(increment(300)).toBe(20);
    expect(increment(1000)).toBe(25);
  });

  it('opens at base price then steps up', () => {
    let s = fresh();
    const base = getPlayer(s.lot.playerId).basePrice;
    expect(nextBidAmount(s.lot)).toBe(base);
    s = placeBid(s, 'CSK');
    expect(s.lot.bid).toBe(base);
    expect(nextBidAmount(s.lot)).toBe(base + increment(base));
  });
});

describe('auction flow', () => {
  it('queues every player once, highest base price first', () => {
    const s = fresh();
    expect(new Set(s.queue).size).toBe(PLAYERS.length);
    const prices = s.queue.map((id) => getPlayer(id).basePrice);
    expect([...prices].sort((a, b) => b - a)).toEqual(prices);
  });

  it('blocks the highest bidder from outbidding itself', () => {
    const s = placeBid(fresh(), 'CSK');
    expect(bidBlockReason(s, 'CSK')).toBe('Highest bidder');
    expect(placeBid(s, 'CSK')).toBe(s);
  });

  it('sells to the highest bidder and charges the purse', () => {
    let s = fresh();
    const playerId = s.lot.playerId;
    s = placeBid(s, 'CSK');
    s = placeBid(s, 'MI');
    const price = s.lot.bid;
    s = hammer(s);
    const mi = s.teams.find((t) => t.id === 'MI');
    expect(mi.purse).toBe(PURSE - price);
    expect(mi.squad).toEqual([{ playerId, price }]);
    expect(s.results[playerId]).toEqual({ teamId: 'MI', price });
    expect(s.lotIndex).toBe(1);
  });

  it('marks a player unsold when nobody bids and can re-auction them', () => {
    let s = fresh();
    const playerId = s.lot.playerId;
    s = hammer(s);
    expect(s.results[playerId]).toEqual({ unsold: true });
    while (s.phase === 'auction') s = hammer(s);
    expect(s.phase).toBe('complete');
    expect(unsoldPlayerIds(s)).toHaveLength(PLAYERS.length);
    s = reauctionUnsold(s);
    expect(s.phase).toBe('auction');
    expect(s.round).toBe(2);
    expect(s.queue).toHaveLength(PLAYERS.length);
  });
});

describe('squad rules', () => {
  it('reserves purse for the remaining minimum squad', () => {
    const team = { purse: PURSE, squad: [] };
    expect(maxBid(team)).toBe(PURSE - (MIN_SQUAD - 1) * 30);
  });

  it('blocks a full squad', () => {
    const s = fresh();
    s.teams[0].squad = Array.from({ length: MAX_SQUAD }, (_, i) => ({ playerId: PLAYERS[i].id, price: 30 }));
    expect(bidBlockReason(s, s.teams[0].id)).toBe('Squad full');
  });

  it('blocks a ninth overseas player', () => {
    let s = fresh();
    while (!getPlayer(s.lot.playerId).overseas) s = hammer(s);
    const overseas = PLAYERS.filter((pl) => pl.overseas).slice(0, 8);
    s.teams[0].squad = overseas.map((pl) => ({ playerId: pl.id, price: 200 }));
    expect(bidBlockReason(s, s.teams[0].id)).toBe('Overseas limit');
  });
});

describe('computer teams', () => {
  it('never picks a human team', () => {
    const s = fresh(['CSK', 'MI', 'RCB', 'KKR', 'SRH', 'RR', 'DC', 'PBKS', 'GT']);
    const pick = aiPickBidder(s, () => 0);
    expect(pick === null || pick === 'LSG').toBe(true);
  });

  it('runs a full auction without breaking any rule', () => {
    let s = createAuction({ humanTeamIds: [], seed: 7 });
    let guard = 0;
    while (s.phase === 'auction' && guard < 100000) {
      const bidder = aiPickBidder(s, () => 0.5);
      s = bidder ? placeBid(s, bidder) : hammer(s);
      guard += 1;
    }
    expect(s.phase).toBe('complete');
    const sold = s.teams.reduce((n, t) => n + t.squad.length, 0);
    expect(sold).toBeGreaterThan(PLAYERS.length / 2);
    for (const t of s.teams) {
      expect(t.purse).toBeGreaterThanOrEqual(0);
      expect(t.squad.length).toBeLessThanOrEqual(MAX_SQUAD);
    }
  });
});

describe('formatAmount', () => {
  it('shows lakhs and crores', () => {
    expect(formatAmount(50)).toBe('₹50 L');
    expect(formatAmount(200)).toBe('₹2 Cr');
    expect(formatAmount(1525)).toBe('₹15.25 Cr');
    expect(formatAmount(210)).toBe('₹2.1 Cr');
  });
});

describe('jump bids and options', () => {
  it('allows a jump of one extra step and nothing else', () => {
    let s = fresh();
    const [next, jump] = validBidAmounts(s.lot);
    expect(jump).toBe(next + increment(next));
    expect(placeBid(s, 'CSK', jump + 5)).toBe(s);
    s = placeBid(s, 'CSK', jump);
    expect(s.lot.bid).toBe(jump);
  });

  it('uses a custom purse and random order', () => {
    const s = createAuction({ humanTeamIds: [], seed: 3, purse: 9000, order: 'random' });
    expect(s.teams.every((t) => t.purse === 9000)).toBe(true);
    const prices = s.queue.map((id) => getPlayer(id).basePrice);
    expect([...prices].sort((a, b) => b - a)).not.toEqual(prices);
  });

  it('rates a squad on its best eleven', () => {
    const team = { squad: [{ playerId: 3, price: 200 }] };
    expect(squadRating(team)).toBe(Math.round(97 / 11));
  });
});
