let ctx = null;
let muted = false;
try {
  muted = localStorage.getItem('ipl-muted') === '1';
} catch {
  muted = false;
}

export const isMuted = () => muted;
export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem('ipl-muted', value ? '1' : '0');
  } catch {
    // Ignore storage errors.
  }
}

function audio() {
  if (muted) return null;
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, start, length, type = 'sine', gain = 0.12) {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const amp = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = a.currentTime + start;
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(amp).connect(a.destination);
  osc.start(t);
  osc.stop(t + length + 0.05);
}

export const sounds = {
  bid: () => tone(880, 0, 0.09, 'triangle', 0.08),
  tick: () => tone(1320, 0, 0.05, 'square', 0.03),
  gavel: () => {
    tone(140, 0, 0.18, 'square', 0.18);
    tone(90, 0.02, 0.22, 'sine', 0.2);
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, 'triangle', 0.1)),
  unlock: () => audio(),
};
