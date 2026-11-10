import { io } from 'socket.io-client';
import { useSyncExternalStore } from 'react';

const CLIENT_KEY = 'ipl-client-id';
const SESSION_KEY = 'ipl-session';

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private windows can block storage. The app still works for this visit.
  }
}

// crypto.randomUUID needs HTTPS, and friends on Wi-Fi use plain http, so build the id by hand.
function randomId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function clientId() {
  let id = safeGet(CLIENT_KEY);
  if (!id) {
    id = randomId();
    safeSet(CLIENT_KEY, id);
  }
  return id;
}

export function savedSession() {
  try {
    return JSON.parse(safeGet(SESSION_KEY)) ?? {};
  } catch {
    return {};
  }
}

function saveSession(patch) {
  safeSet(SESSION_KEY, JSON.stringify({ ...savedSession(), ...patch }));
}

let state = {
  connected: false,
  rejoining: Boolean(savedSession().code),
  room: null,
  offset: 0,
  lanUrls: [],
  toasts: [],
};
const listeners = new Set();

function setState(patch) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
}

export function useNet() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
  );
}

let toastCounter = 0;
export function toast(text, tone = 'error') {
  toastCounter += 1;
  const id = toastCounter;
  setState({ toasts: [...state.toasts, { id, text, tone }].slice(-3) });
  setTimeout(() => setState({ toasts: state.toasts.filter((t) => t.id !== id) }), 3500);
}

export const socket = io({ auth: { clientId: clientId() } });

socket.on('connect', () => {
  setState({ connected: true });
  const { code, name } = savedSession();
  if (code) {
    socket.emit('join', { code, name }, (result) => {
      if (!result?.ok) {
        saveSession({ code: null });
        setState({ room: null });
      }
      setState({ rejoining: false });
    });
  } else {
    setState({ rejoining: false });
  }
});

socket.on('disconnect', () => setState({ connected: false }));
socket.on('hello', ({ lanUrls }) => setState({ lanUrls }));
socket.on('room', (room) => setState({ room, offset: room ? room.serverNow - Date.now() : 0 }));

function emit(event, payload) {
  return new Promise((resolve) => {
    socket.timeout(5000).emit(event, payload, (err, result) => {
      const outcome = err ? { ok: false, error: 'The server did not answer. Check your connection.' } : result;
      if (!outcome.ok) toast(outcome.error);
      resolve(outcome);
    });
  });
}

export const net = {
  async create(name) {
    const result = await emit('create', { name });
    if (result.ok) saveSession({ code: result.code, name: name.trim() });
    return result;
  },
  async join(code, name) {
    const result = await emit('join', { code, name });
    if (result.ok) saveSession({ code: result.code, name: name.trim() });
    return result;
  },
  forget() {
    saveSession({ code: null });
    setState({ rejoining: false, room: null });
  },
  async leave() {
    saveSession({ code: null });
    await emit('leave');
    setState({ room: null });
  },
  act(type, payload) {
    return emit('action', { type, payload });
  },
};

export function serverNow() {
  return Date.now() + state.offset;
}

export function inviteUrl(code) {
  const { hostname, origin } = window.location;
  const local = hostname === 'localhost' || hostname === '127.0.0.1';
  const base = local && state.lanUrls.length ? state.lanUrls[0] : origin;
  return `${base}/?room=${code}`;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs HTTPS. Fall back to the old copy command.
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

export function roomContext(room) {
  const memberName = (id) => room.members.find((m) => m.id === id)?.name ?? 'Someone';
  const myTeams = Object.entries(room.claims)
    .filter(([, owner]) => owner === room.you)
    .map(([teamId]) => teamId);
  return {
    isHost: room.you === room.hostId,
    myTeams,
    memberName,
    ownerOf: (teamId) => (room.claims[teamId] ? memberName(room.claims[teamId]) : null),
  };
}
