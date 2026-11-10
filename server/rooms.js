import {
  createAuction,
  placeBid,
  hammer,
  validBidAmounts,
  bidBlockReason,
  aiPickBidder,
  reauctionUnsold,
} from '../src/auction.js';
import { TEAMS } from '../src/data.js';

export const LOT_MS = 8000;
export const DEFAULT_SETTINGS = { timerSeconds: 8, purse: 12000, order: 'base', computerBidders: true };
const SETTING_CHOICES = {
  timerSeconds: [5, 8, 12, 15],
  purse: [9000, 10000, 12000, 15000],
  order: ['base', 'random'],
  computerBidders: [true, false],
};
export const REACTIONS = ['🔥', '👏', '😂', '😱', '💸'];
const REACTION_TTL_MS = 4000;
const MAX_CHAT = 60;
export const FLASH_MS = 1600;
export const ROOM_IDLE_MS = 30 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_NAME = 20;

const fail = (error) => ({ ok: false, error });
const OK = { ok: true };

export class RoomManager {
  constructor({ now = Date.now, rng = Math.random } = {}) {
    this.rooms = new Map();
    this.now = now;
    this.rng = rng;
    this.memberCounter = 0;
  }

  get(code) {
    return this.rooms.get(code);
  }

  newCode() {
    for (;;) {
      let code = '';
      for (let i = 0; i < 4; i += 1) code += CODE_ALPHABET[Math.floor(this.rng() * CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  createRoom(clientId, name) {
    const cleanName = cleanPlayerName(name);
    if (!cleanName) return fail('Enter your name');
    const code = this.newCode();
    this.rooms.set(code, {
      code,
      hostClientId: clientId,
      phase: 'lobby',
      settings: { ...DEFAULT_SETTINGS },
      chat: [],
      reactions: [],
      eventCounter: 0,
      members: {},
      claims: {},
      game: null,
      deadline: null,
      pausedRemaining: null,
      flash: null,
      nextAiAt: Infinity,
      lastActive: this.now(),
    });
    this.join(code, clientId, cleanName);
    return { ok: true, code };
  }

  join(code, clientId, name) {
    const room = this.rooms.get(normalizeCode(code));
    if (!room) return fail('No room with that code');
    const cleanName = cleanPlayerName(name);
    const existing = room.members[clientId];
    if (!existing && !cleanName) return fail('Enter your name');
    if (existing) {
      existing.connected = true;
      if (cleanName) existing.name = cleanName;
    } else {
      this.memberCounter += 1;
      room.members[clientId] = {
        id: `m${this.memberCounter}`,
        name: cleanName,
        connected: true,
        order: this.memberCounter,
      };
    }
    room.lastActive = this.now();
    return { ok: true, code: room.code };
  }

  setConnected(code, clientId, connected) {
    const room = this.rooms.get(code);
    const member = room?.members[clientId];
    if (!member) return;
    member.connected = connected;
    room.lastActive = this.now();
  }

  leave(code, clientId) {
    const room = this.rooms.get(code);
    const member = room?.members[clientId];
    if (!member) return fail('Not in this room');
    if (room.phase === 'lobby') {
      releaseMember(room, member.id);
      delete room.members[clientId];
    } else {
      member.connected = false;
    }
    return OK;
  }

  hostOf(room) {
    const host = room.members[room.hostClientId];
    if (host?.connected) return room.hostClientId;
    const online = Object.entries(room.members)
      .filter(([, m]) => m.connected)
      .sort(([, a], [, b]) => a.order - b.order);
    return online.length ? online[0][0] : room.hostClientId;
  }

  isHost(room, clientId) {
    return this.hostOf(room) === clientId;
  }

  act(code, clientId, type, payload = {}) {
    const room = this.rooms.get(code);
    if (!room) return fail('This room has closed');
    const member = room.members[clientId];
    if (!member) return fail('Join the room first');
    room.lastActive = this.now();
    switch (type) {
      case 'claim':
        return this.claim(room, member, payload.teamId);
      case 'release':
        if (room.phase !== 'lobby') return fail('Teams are locked once the auction starts');
        releaseMember(room, member.id);
        return OK;
      case 'settings':
        return this.hostOnly(room, clientId, () => this.updateSettings(room, payload));
      case 'chat':
        return this.chat(room, member, payload.text);
      case 'react':
        return this.react(room, member, payload.emoji);
      case 'start':
        return this.start(room, clientId);
      case 'bid':
        return this.bid(room, member, payload.teamId, payload.amount);
      case 'sell':
        return this.hostOnly(room, clientId, () => this.sellNow(room));
      case 'pause':
        return this.hostOnly(room, clientId, () => this.pause(room));
      case 'resume':
        return this.hostOnly(room, clientId, () => this.resume(room));
      case 'reauction':
        return this.hostOnly(room, clientId, () => this.reauction(room));
      default:
        return fail('Unknown action');
    }
  }

  hostOnly(room, clientId, fn) {
    if (!this.isHost(room, clientId)) return fail('Only the host can do that');
    return fn();
  }

  updateSettings(room, patch) {
    if (room.phase !== 'lobby') return fail('Settings are locked once the auction starts');
    for (const [key, value] of Object.entries(patch ?? {})) {
      if (!SETTING_CHOICES[key]?.includes(value)) return fail('That setting is not allowed');
    }
    room.settings = { ...room.settings, ...patch };
    return OK;
  }

  chat(room, member, text) {
    const clean = typeof text === 'string' ? text.trim().slice(0, 200) : '';
    if (!clean) return fail('Type a message first');
    const now = this.now();
    if (member.lastChatAt && now - member.lastChatAt < 500) return fail('Slow down a little');
    member.lastChatAt = now;
    room.eventCounter += 1;
    room.chat = [...room.chat, { id: room.eventCounter, memberId: member.id, text: clean, at: now }].slice(-MAX_CHAT);
    return OK;
  }

  react(room, member, emoji) {
    if (!REACTIONS.includes(emoji)) return fail('Unknown reaction');
    const now = this.now();
    if (member.lastReactAt && now - member.lastReactAt < 300) return { ok: true, quiet: true };
    member.lastReactAt = now;
    room.eventCounter += 1;
    room.reactions = [
      ...room.reactions.filter((r) => now - r.at < REACTION_TTL_MS),
      { id: room.eventCounter, memberId: member.id, emoji, at: now },
    ].slice(-30);
    return OK;
  }

  claim(room, member, teamId) {
    if (room.phase !== 'lobby') return fail('Teams are locked once the auction starts');
    if (!TEAMS.some((t) => t.id === teamId)) return fail('Unknown team');
    const owner = room.claims[teamId];
    if (owner && owner !== member.id) return fail('Someone already picked that team');
    releaseMember(room, member.id);
    room.claims[teamId] = member.id;
    return OK;
  }

  start(room, clientId) {
    if (!this.isHost(room, clientId)) return fail('Only the host can start the auction');
    if (room.phase !== 'lobby') return fail('The auction has already started');
    room.game = createAuction({
      humanTeamIds: Object.keys(room.claims),
      seed: Math.floor(this.rng() * 2 ** 31),
      purse: room.settings.purse,
      order: room.settings.order,
    });
    room.phase = 'auction';
    this.openLot(room);
    return OK;
  }

  openLot(room) {
    room.flash = null;
    room.pausedRemaining = null;
    room.deadline = this.now() + lotMs(room);
    this.scheduleAi(room);
  }

  scheduleAi(room) {
    room.nextAiAt = room.settings.computerBidders ? this.now() + 700 + this.rng() * 1300 : Infinity;
  }

  canTakeBids(room) {
    return (
      room.phase === 'auction' &&
      room.game?.phase === 'auction' &&
      room.pausedRemaining === null &&
      room.flash === null
    );
  }

  bid(room, member, teamId, amount) {
    if (!this.canTakeBids(room)) return fail('Bidding is closed right now');
    if (room.claims[teamId] !== member.id) return fail('That is not your team');
    if (!validBidAmounts(room.game.lot).includes(amount)) return fail('Someone bid first. Try again.');
    const reason = bidBlockReason(room.game, teamId, amount);
    if (reason) return fail(reason);
    this.applyBid(room, teamId, amount);
    return OK;
  }

  applyBid(room, teamId, amount) {
    room.game = placeBid(room.game, teamId, amount);
    room.deadline = this.now() + lotMs(room);
    this.scheduleAi(room);
  }

  sellNow(room) {
    if (!this.canTakeBids(room)) return fail('No player on the block');
    this.closeLot(room);
    return OK;
  }

  closeLot(room) {
    const { playerId, bidder, bid } = room.game.lot;
    room.flash = { playerId, teamId: bidder, price: bid, until: this.now() + FLASH_MS };
    room.game = hammer(room.game);
    room.deadline = null;
    room.nextAiAt = Infinity;
  }

  pause(room) {
    if (!this.canTakeBids(room)) return fail('Nothing to pause');
    room.pausedRemaining = Math.max(0, room.deadline - this.now());
    room.deadline = null;
    return OK;
  }

  resume(room) {
    if (room.pausedRemaining === null) return fail('The auction is not paused');
    room.deadline = this.now() + Math.max(room.pausedRemaining, Math.min(3000, lotMs(room)));
    room.pausedRemaining = null;
    this.scheduleAi(room);
    return OK;
  }

  reauction(room) {
    if (room.game?.phase !== 'complete') return fail('The auction is still running');
    const next = reauctionUnsold(room.game);
    if (next === room.game) return fail('Every player was sold');
    room.game = next;
    this.openLot(room);
    return OK;
  }

  // Advances clocks and computer bids. Returns the codes of rooms that changed.
  tick() {
    const now = this.now();
    const changed = [];
    for (const [code, room] of this.rooms) {
      const anyoneHere = Object.values(room.members).some((m) => m.connected);
      if (!anyoneHere && now - room.lastActive > ROOM_IDLE_MS) {
        this.rooms.delete(code);
        continue;
      }
      if (room.phase !== 'auction' || room.pausedRemaining !== null) continue;
      if (room.flash) {
        if (now >= room.flash.until) {
          if (room.game.phase === 'auction') this.openLot(room);
          else room.flash = null;
          changed.push(code);
        }
        continue;
      }
      if (room.game.phase !== 'auction') continue;
      if (now >= room.deadline) {
        this.closeLot(room);
        changed.push(code);
      } else if (now >= room.nextAiAt) {
        const bidder = aiPickBidder(room.game, this.rng);
        if (bidder) {
          this.applyBid(room, bidder);
          changed.push(code);
        } else {
          room.nextAiAt = Infinity;
        }
      }
    }
    return changed;
  }

  view(code, clientId) {
    const room = this.rooms.get(code);
    if (!room) return null;
    const hostClientId = this.hostOf(room);
    return {
      code: room.code,
      phase: room.phase,
      you: room.members[clientId]?.id ?? null,
      hostId: room.members[hostClientId]?.id ?? null,
      members: Object.values(room.members)
        .sort((a, b) => a.order - b.order)
        .map(({ id, name, connected }) => ({ id, name, connected })),
      claims: room.claims,
      settings: room.settings,
      chat: room.chat,
      reactions: room.reactions.filter((r) => this.now() - r.at < REACTION_TTL_MS),
      game: room.game,
      deadline: room.deadline,
      pausedRemaining: room.pausedRemaining,
      flash: room.flash,
      serverNow: this.now(),
    };
  }
}

const lotMs = (room) => room.settings.timerSeconds * 1000;

function releaseMember(room, memberId) {
  for (const [teamId, owner] of Object.entries(room.claims)) {
    if (owner === memberId) delete room.claims[teamId];
  }
}

function cleanPlayerName(name) {
  return typeof name === 'string' ? name.trim().slice(0, MAX_NAME) : '';
}

function normalizeCode(code) {
  return typeof code === 'string' ? code.trim().toUpperCase() : '';
}
