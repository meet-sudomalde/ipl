import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { TEAMS, PLAYERS } from '../data.js';
import { formatAmount } from '../auction.js';
import { net, inviteUrl, copyText, roomContext, toast } from '../net.js';

const SETTINGS = [
  {
    key: 'timerSeconds',
    label: 'Bid clock',
    options: [5, 8, 12, 15].map((v) => ({ value: v, label: `${v} seconds` })),
  },
  {
    key: 'purse',
    label: 'Purse per team',
    options: [9000, 10000, 12000, 15000].map((v) => ({ value: v, label: formatAmount(v) })),
  },
  {
    key: 'order',
    label: 'Player order',
    options: [
      { value: 'base', label: 'Biggest names first' },
      { value: 'random', label: 'Shuffled' },
    ],
  },
  {
    key: 'computerBidders',
    label: 'Teams nobody picks',
    options: [
      { value: true, label: 'Computer bids for them' },
      { value: false, label: 'Sit out' },
    ],
  },
];

export default function Lobby({ room }) {
  const { isHost, memberName } = roomContext(room);
  const url = inviteUrl(room.code);
  const [qr, setQr] = useState(null);
  const myTeam = Object.entries(room.claims).find(([, owner]) => owner === room.you)?.[0];
  const humanCount = Object.keys(room.claims).length;
  const computerCount = TEAMS.length - humanCount;

  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#0d2118', light: '#eef3ee' } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);

  const setting = (key, value) => net.act('settings', { [key]: value });

  return (
    <main className="lobby">
      <section className="invite" aria-labelledby="invite-title">
        <h2 id="invite-title" className="sr-only">
          Invite friends
        </h2>
        <div className="invite-code" aria-label={`Room code ${room.code.split('').join(' ')}`}>
          {room.code.split('').map((ch, i) => (
            <span key={i}>{ch}</span>
          ))}
        </div>
        <p className="invite-how">Friends scan the code or open the link, then type their name.</p>
        {qr && <img className="qr" src={qr} alt={`QR code that opens ${url}`} />}
        <div className="invite-link">
          <span>{url.replace(/^https?:\/\//, '')}</span>
          <button
            className="btn btn-line btn-sm"
            onClick={async () => toast((await copyText(url)) ? 'Invite link copied' : 'Copy failed', 'ok')}
          >
            Copy link
          </button>
        </div>
        {url.includes('localhost') && (
          <p className="hint">
            This computer has no Wi-Fi address right now, so friends on other devices can't join.
          </p>
        )}
      </section>

      <section className="lobby-main">
        <div className="lobby-head">
          <h2>Pick your team</h2>
          <p className="muted">
            {myTeam ? 'Tap your team again to let it go.' : 'Tap a franchise to claim it. One each.'}
          </p>
        </div>
        <div className="claim-grid">
          {TEAMS.map((t) => {
            const owner = room.claims[t.id];
            const mine = owner === room.you;
            const taken = owner && !mine;
            return (
              <button
                key={t.id}
                className={`claim ${owner ? 'claimed' : ''} ${mine ? 'mine' : ''}`}
                style={{ '--team': t.color, '--team-ink': t.ink }}
                disabled={!!taken}
                aria-pressed={mine}
                onClick={() => net.act(mine ? 'release' : 'claim', { teamId: t.id })}
              >
                <span className="claim-code">{t.id}</span>
                <span className="claim-name">{t.name}</span>
                <span className="claim-owner">
                  {owner
                    ? mine
                      ? 'You'
                      : memberName(owner)
                    : room.settings.computerBidders
                      ? 'Computer'
                      : 'Open'}
                </span>
              </button>
            );
          })}
        </div>

        <div className="lobby-lower">
          <section className="people" aria-labelledby="people-title">
            <h3 id="people-title">In the room</h3>
            <ul>
              {room.members.map((m) => {
                const team = Object.entries(room.claims).find(([, owner]) => owner === m.id)?.[0];
                return (
                  <li key={m.id} className={m.connected ? '' : 'offline'}>
                    <span className={`dot ${m.connected ? 'on' : ''}`} aria-hidden="true" />
                    <span className="person-name">
                      {m.name}
                      {m.id === room.you && <span className="muted"> (you)</span>}
                    </span>
                    {m.id === room.hostId && <span className="pill">Host</span>}
                    <span className="person-team">{team ?? 'Watching'}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="settings" aria-labelledby="settings-title">
            <h3 id="settings-title">Auction settings</h3>
            {!isHost && <p className="hint">Only the host can change these.</p>}
            {SETTINGS.map((s) => (
              <fieldset key={s.key} className="seg" disabled={!isHost}>
                <legend>{s.label}</legend>
                <div className="seg-options">
                  {s.options.map((o) => (
                    <label key={String(o.value)} className={room.settings[s.key] === o.value ? 'on' : ''}>
                      <input
                        type="radio"
                        name={s.key}
                        checked={room.settings[s.key] === o.value}
                        onChange={() => setting(s.key, o.value)}
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </section>
        </div>

        <div className="start-bar">
          <p>
            {humanCount === 0
              ? 'Nobody has picked a team yet.'
              : `${humanCount} ${humanCount === 1 ? 'team' : 'teams'} played by people`}
            {room.settings.computerBidders && computerCount > 0 && `, ${computerCount} by the computer`}.{' '}
            {PLAYERS.length} players in the pool.
          </p>
          {isHost ? (
            <button className="btn btn-gold btn-lg" onClick={() => net.act('start')}>
              Start auction
            </button>
          ) : (
            <p className="waiting">Waiting for {memberName(room.hostId)} to start.</p>
          )}
        </div>
      </section>
    </main>
  );
}
