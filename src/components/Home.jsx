import { useState } from 'react';
import { net, savedSession } from '../net.js';
import { PLAYERS } from '../data.js';

export default function Home() {
  const params = new URLSearchParams(window.location.search);
  const inviteCode = (params.get('room') || '').toUpperCase().slice(0, 4);
  const [name, setName] = useState(savedSession().name ?? '');
  const [code, setCode] = useState(inviteCode);
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    const result = await fn();
    setBusy(false);
    if (result.ok && inviteCode) window.history.replaceState(null, '', '/');
  };

  const nameOk = name.trim().length > 0;

  return (
    <main className="home">
      <section className="home-hero">
        <h1 className="home-title">
          <span>IPL</span>
          <span>Auction</span>
        </h1>
        <p className="home-lede">
          Run a live player auction with your friends. Everyone picks a franchise and bids from their
          own phone while the hammer counts down.
        </p>
      </section>

      <section className="home-panel" aria-label="Join or host">
        <label className="field">
          <span>Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="What should friends call you?"
            autoComplete="nickname"
            autoFocus={!inviteCode}
          />
        </label>

        <form
          className="join"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => net.join(code, name));
          }}
        >
          <label className="field">
            <span>Room code</span>
            <input
              className="code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
              placeholder="ABCD"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              autoFocus={!!inviteCode}
            />
          </label>
          <button className="btn btn-gold" disabled={busy || !nameOk || code.length !== 4}>
            Join room
          </button>
        </form>

        <div className="or">or</div>

        <button
          className="btn btn-line btn-wide"
          disabled={busy || !nameOk}
          onClick={() => run(() => net.create(name))}
        >
          Host a new room
        </button>
        {!nameOk && <p className="hint">Enter your name to host or join.</p>}
      </section>

      <ol className="steps">
        <li>
          <strong>Host a room.</strong> You get a four-letter code and a QR code to share.
        </li>
        <li>
          <strong>Friends pick teams.</strong> Any franchise nobody takes is bid for by the computer.
        </li>
        <li>
          <strong>Bid live.</strong> {PLAYERS.length} players go under the hammer one by one.
        </li>
      </ol>
    </main>
  );
}
