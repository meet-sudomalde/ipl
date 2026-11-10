import { describe, it, expect } from 'vitest';
import { RoomManager, LOT_MS, FLASH_MS } from './rooms.js';
import { mulberry32, nextBidAmount } from '../src/auction.js';

function setup() {
  let t = 1_000_000;
  const clock = {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
  };
  const rooms = new RoomManager({ now: clock.now, rng: mulberry32(5) });
  const { code } = rooms.createRoom('host-client', 'Meet');
  rooms.join(code, 'friend-client', 'Rahul');
  return { rooms, code, clock };
}

const lot = (rooms, code) => rooms.get(code).game.lot;

describe('lobby', () => {
  it('rejects unknown codes and blank names', () => {
    const { rooms, code } = setup();
    expect(rooms.join('ZZZZ', 'x', 'A').ok).toBe(false);
    expect(rooms.join(code, 'new-client', '  ').ok).toBe(false);
    expect(rooms.join(code.toLowerCase(), 'new-client', 'Priya').ok).toBe(true);
  });

  it('lets each person hold one team and blocks taken teams', () => {
    const { rooms, code } = setup();
    expect(rooms.act(code, 'host-client', 'claim', { teamId: 'CSK' }).ok).toBe(true);
    expect(rooms.act(code, 'friend-client', 'claim', { teamId: 'CSK' }).error).toMatch(/already/);
    rooms.act(code, 'host-client', 'claim', { teamId: 'MI' });
    expect(rooms.get(code).claims).toEqual({ MI: 'm1' });
  });

  it('only lets the host start, and hands host to the next person if the host drops', () => {
    const { rooms, code } = setup();
    expect(rooms.act(code, 'friend-client', 'start').ok).toBe(false);
    rooms.setConnected(code, 'host-client', false);
    expect(rooms.act(code, 'friend-client', 'start').ok).toBe(true);
  });

  it('hides client ids from the shared view', () => {
    const { rooms, code } = setup();
    const view = JSON.stringify(rooms.view(code, 'friend-client'));
    expect(view).not.toContain('host-client');
    expect(rooms.view(code, 'friend-client').you).toBe('m2');
  });
});

describe('bidding', () => {
  function started() {
    const s = setup();
    s.rooms.act(s.code, 'host-client', 'claim', { teamId: 'CSK' });
    s.rooms.act(s.code, 'friend-client', 'claim', { teamId: 'MI' });
    s.rooms.act(s.code, 'host-client', 'start');
    return s;
  }

  it('accepts a bid only for your own team at the current price', () => {
    const { rooms, code } = started();
    const amount = nextBidAmount(lot(rooms, code));
    expect(rooms.act(code, 'friend-client', 'bid', { teamId: 'CSK', amount }).error).toMatch(/not your team/);
    expect(rooms.act(code, 'friend-client', 'bid', { teamId: 'MI', amount: amount + 5 }).ok).toBe(false);
    expect(rooms.act(code, 'friend-client', 'bid', { teamId: 'MI', amount }).ok).toBe(true);
    expect(lot(rooms, code).bidder).toBe('MI');
  });

  it('rejects the slower of two bids at the same price', () => {
    const { rooms, code } = started();
    const amount = nextBidAmount(lot(rooms, code));
    rooms.act(code, 'host-client', 'bid', { teamId: 'CSK', amount });
    expect(rooms.act(code, 'friend-client', 'bid', { teamId: 'MI', amount }).error).toMatch(/bid first/);
  });

  it('sells when the clock runs out, shows the result, then opens the next lot', () => {
    const { rooms, code, clock } = started();
    rooms.get(code).nextAiAt = Infinity;
    const first = lot(rooms, code).playerId;
    rooms.act(code, 'host-client', 'bid', { teamId: 'CSK', amount: nextBidAmount(lot(rooms, code)) });
    rooms.get(code).nextAiAt = Infinity;
    clock.advance(LOT_MS);
    expect(rooms.tick()).toEqual([code]);
    const room = rooms.get(code);
    expect(room.flash.teamId).toBe('CSK');
    expect(room.game.results[first].teamId).toBe('CSK');
    clock.advance(FLASH_MS);
    rooms.tick();
    expect(room.flash).toBeNull();
    expect(lot(rooms, code).playerId).not.toBe(first);
  });

  it('freezes the clock while paused', () => {
    const { rooms, code, clock } = started();
    rooms.act(code, 'host-client', 'pause');
    expect(rooms.act(code, 'host-client', 'bid', { teamId: 'CSK', amount: 1 }).error).toMatch(/closed/);
    clock.advance(LOT_MS * 5);
    expect(rooms.tick()).toEqual([]);
    rooms.act(code, 'host-client', 'resume');
    expect(rooms.get(code).deadline).toBeGreaterThan(clock.now());
  });

  it('lets computer teams finish a whole auction', () => {
    const { rooms, code, clock } = started();
    let guard = 0;
    while (rooms.get(code).game.phase === 'auction' && guard < 50000) {
      clock.advance(250);
      rooms.tick();
      guard += 1;
    }
    const { game } = rooms.get(code);
    expect(game.phase).toBe('complete');
    const sold = game.teams.reduce((n, t) => n + t.squad.length, 0);
    expect(sold).toBeGreaterThan(40);
    expect(game.teams.find((t) => t.id === 'CSK').squad).toHaveLength(0);
  });
});

describe('cleanup', () => {
  it('closes rooms that have been empty for a while', () => {
    const { rooms, code, clock } = setup();
    rooms.setConnected(code, 'host-client', false);
    rooms.setConnected(code, 'friend-client', false);
    clock.advance(31 * 60 * 1000);
    rooms.tick();
    expect(rooms.get(code)).toBeUndefined();
  });
});

describe('room extras', () => {
  it('lets only the host change allowed settings in the lobby', () => {
    const { rooms, code } = setup();
    expect(rooms.act(code, 'friend-client', 'settings', { timerSeconds: 5 }).ok).toBe(false);
    expect(rooms.act(code, 'host-client', 'settings', { timerSeconds: 7 }).ok).toBe(false);
    expect(rooms.act(code, 'host-client', 'settings', { timerSeconds: 12, purse: 9000 }).ok).toBe(true);
    rooms.act(code, 'host-client', 'start');
    expect(rooms.get(code).game.teams[0].purse).toBe(9000);
    expect(rooms.get(code).deadline - 1_000_000).toBe(12000);
  });

  it('keeps computer teams quiet when they are switched off', () => {
    const { rooms, code, clock } = setup();
    rooms.act(code, 'host-client', 'settings', { computerBidders: false });
    rooms.act(code, 'host-client', 'start');
    for (let i = 0; i < 20; i += 1) {
      clock.advance(250);
      rooms.tick();
    }
    expect(rooms.get(code).game.lot.bidder).toBeNull();
  });

  it('accepts a jump bid of one extra step', () => {
    const { rooms, code } = setup();
    rooms.act(code, 'host-client', 'claim', { teamId: 'CSK' });
    rooms.act(code, 'host-client', 'start');
    const next = nextBidAmount(lot(rooms, code));
    const jump = next + (next < 100 ? 5 : next < 200 ? 10 : next < 500 ? 20 : 25);
    expect(rooms.act(code, 'host-client', 'bid', { teamId: 'CSK', amount: jump }).ok).toBe(true);
    expect(lot(rooms, code).bid).toBe(jump);
  });

  it('stores chat and short-lived reactions', () => {
    const { rooms, code, clock } = setup();
    expect(rooms.act(code, 'friend-client', 'chat', { text: '  bumrah is mine ' }).ok).toBe(true);
    expect(rooms.act(code, 'friend-client', 'react', { emoji: '🔥' }).ok).toBe(true);
    expect(rooms.act(code, 'friend-client', 'react', { emoji: '<script>' }).ok).toBe(false);
    let view = rooms.view(code, 'host-client');
    expect(view.chat[0]).toMatchObject({ memberId: 'm2', text: 'bumrah is mine' });
    expect(view.reactions).toHaveLength(1);
    clock.advance(5000);
    view = rooms.view(code, 'host-client');
    expect(view.reactions).toHaveLength(0);
  });
});
