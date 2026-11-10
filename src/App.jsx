import { useCallback, useEffect, useState } from 'react';
import { TEAMS, PLAYERS, MAX_SQUAD, MAX_OVERSEAS, PURSE } from './data.js';
import {
  createAuction,
  placeBid,
  hammer,
  nextBidAmount,
  bidBlockReason,
  aiPickBidder,
  reauctionUnsold,
  unsoldPlayerIds,
  overseasCount,
  formatAmount,
  getPlayer,
} from './auction.js';

const STORAGE_KEY = 'ipl-auction-v1';
const TIMER_SECONDS = 8;
const teamById = (id) => TEAMS.find((t) => t.id === id);

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [game, setGame] = useState(loadSaved);

  useEffect(() => {
    try {
      if (game) localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage can be unavailable in private windows; the auction still works.
    }
  }, [game]);

  if (!game) return <Setup onStart={(humans) => setGame(createAuction({ humanTeamIds: humans }))} />;

  return (
    <div className="shell">
      <header className="topbar">
        <h1 className="brand">IPL Auction</h1>
        <span className="round">{game.round === 1 ? 'Main round' : `Unsold round ${game.round - 1}`}</span>
        <button
          className="ghost"
          onClick={() => {
            if (window.confirm('End this auction and start over?')) setGame(null);
          }}
        >
          New auction
        </button>
      </header>
      {game.phase === 'complete' ? (
        <Summary game={game} setGame={setGame} />
      ) : (
        <AuctionRoom game={game} setGame={setGame} />
      )}
    </div>
  );
}

function Setup({ onStart }) {
  const [humans, setHumans] = useState(['CSK']);
  const toggle = (id) =>
    setHumans((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));

  return (
    <main className="setup">
      <h1 className="setup-title">IPL Auction</h1>
      <p className="setup-lede">
        {PLAYERS.length} players, 10 franchises, {formatAmount(PURSE)} each. Pick the teams you
        will bid for. The computer bids for the rest. Pick all ten to run the room for friends.
      </p>
      <fieldset className="team-picker">
        <legend>Teams you control</legend>
        {TEAMS.map((t) => {
          const on = humans.includes(t.id);
          return (
            <label
              key={t.id}
              className={`pick ${on ? 'on' : ''}`}
              style={{ '--team': t.color, '--team-ink': t.ink }}
            >
              <input type="checkbox" checked={on} onChange={() => toggle(t.id)} />
              <span className="pick-code">{t.id}</span>
              <span className="pick-name">{t.name}</span>
            </label>
          );
        })}
      </fieldset>
      <div className="setup-actions">
        <button className="primary" onClick={() => onStart(humans)}>
          {humans.length === 0 ? 'Watch the computer run it' : 'Start auction'}
        </button>
        <p className="rules">
          Squads hold up to {MAX_SQUAD} players with at most {MAX_OVERSEAS} from overseas. Each team
          must keep enough purse to fill 18 places at ₹30 L.
        </p>
      </div>
    </main>
  );
}

function AuctionRoom({ game, setGame }) {
  const [secondsLeft, setSecondsLeft] = useState(TIMER_SECONDS);
  const [paused, setPaused] = useState(false);
  const [flash, setFlash] = useState(null);
  const { lot } = game;
  const player = getPlayer(lot.playerId);
  const running = !paused && !flash;

  const closeLot = useCallback(() => {
    setFlash({ playerId: lot.playerId, teamId: lot.bidder, price: lot.bid });
    setGame((g) => hammer(g));
  }, [lot, setGame]);

  useEffect(() => {
    setSecondsLeft(TIMER_SECONDS);
  }, [lot.bid, lot.playerId]);

  useEffect(() => {
    if (!flash) return undefined;
    const id = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(id);
  }, [flash]);

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [running, lot.playerId]);

  useEffect(() => {
    if (running && secondsLeft <= 0) closeLot();
  }, [running, secondsLeft, closeLot]);

  useEffect(() => {
    if (!running) return undefined;
    const id = setTimeout(() => {
      setGame((g) => {
        const bidder = aiPickBidder(g);
        return bidder ? placeBid(g, bidder) : g;
      });
    }, 700 + Math.random() * 1300);
    return () => clearTimeout(id);
  }, [running, lot.bid, lot.playerId, setGame]);

  const humans = game.teams.filter((t) => t.human);
  const leader = lot.bidder ? teamById(lot.bidder) : null;
  const next = nextBidAmount(lot);
  const flashPlayer = flash && getPlayer(flash.playerId);
  const flashTeam = flash?.teamId && teamById(flash.teamId);

  return (
    <main className="room">
      <section className="block" aria-labelledby="lot-name">
        <p className="lot-count">
          Lot {game.lotIndex + 1} of {game.queue.length}
        </p>
        <div className="player">
          <h2 id="lot-name" className="player-name">
            {player.name}
          </h2>
          <p className="player-meta">
            <span>{player.role}</span>
            <span>{player.country}</span>
            {player.overseas && <span className="tag">Overseas</span>}
            <span>Base {formatAmount(player.basePrice)}</span>
          </p>
        </div>

        <div className="bid" style={leader ? { '--team': leader.color } : undefined}>
          <p className="bid-amount" aria-live="polite">
            {lot.bid === null ? 'No bids yet' : formatAmount(lot.bid)}
          </p>
          <p className="bid-leader">
            {leader ? `${leader.name} lead` : `Opening bid ${formatAmount(next)}`}
          </p>
          <Clock seconds={secondsLeft} paused={paused} />
        </div>

        {flash && (
          <div className={`stamp ${flashTeam ? 'sold' : 'unsold'}`} role="status">
            {flashTeam
              ? `Sold to ${flashTeam.id} for ${formatAmount(flash.price)}`
              : `${flashPlayer.name} goes unsold`}
          </div>
        )}

        {humans.length > 0 && (
          <div className="paddles">
            {humans.map((t) => {
              const reason = bidBlockReason(game, t.id);
              return (
                <button
                  key={t.id}
                  className="paddle"
                  style={{ '--team': t.color, '--team-ink': t.ink }}
                  disabled={!!reason || !!flash}
                  onClick={() => setGame((g) => placeBid(g, t.id))}
                >
                  <span className="paddle-code">{t.id}</span>
                  <span className="paddle-amount">{reason ?? `Bid ${formatAmount(next)}`}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="controls">
          <button className="ghost" onClick={() => setPaused((p) => !p)}>
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button className="ghost" onClick={closeLot} disabled={!!flash}>
            {lot.bidder ? 'Sell now' : 'Mark unsold'}
          </button>
        </div>
      </section>

      <aside className="side">
        <TeamTable teams={game.teams} leaderId={lot.bidder} />
        <SalesLog log={game.log} />
      </aside>
    </main>
  );
}

function Clock({ seconds, paused }) {
  const clamped = Math.max(0, seconds);
  const pct = (clamped / TIMER_SECONDS) * 100;
  return (
    <div className={`clock ${clamped <= 3 ? 'late' : ''}`}>
      <div className="clock-bar" style={{ width: `${pct}%` }} />
      <span className="clock-label">
        {paused ? 'Paused' : clamped <= 3 && clamped > 0 ? `Going in ${clamped}` : `${clamped}s`}
      </span>
    </div>
  );
}

function TeamTable({ teams, leaderId }) {
  return (
    <table className="teams">
      <caption>Purses</caption>
      <thead>
        <tr>
          <th scope="col">Team</th>
          <th scope="col">Purse left</th>
          <th scope="col">Squad</th>
          <th scope="col">Overseas</th>
        </tr>
      </thead>
      <tbody>
        {teams.map((t) => (
          <tr key={t.id} className={t.id === leaderId ? 'leading' : ''}>
            <th scope="row">
              <span className="swatch" style={{ background: t.color }} />
              {t.id}
              {t.human && <span className="you">you</span>}
            </th>
            <td>{formatAmount(t.purse)}</td>
            <td>
              {t.squad.length}/{MAX_SQUAD}
            </td>
            <td>
              {overseasCount(t)}/{MAX_OVERSEAS}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SalesLog({ log }) {
  return (
    <section className="log" aria-labelledby="log-title">
      <h2 id="log-title">Latest sales</h2>
      {log.length === 0 ? (
        <p className="muted">Sales show up here as the hammer falls.</p>
      ) : (
        <ol>
          {log.slice(0, 12).map((entry, i) => (
            <li key={`${entry.playerId}-${entry.round}-${i}`}>
              <span>{getPlayer(entry.playerId).name}</span>
              <span className={entry.teamId ? '' : 'muted'}>
                {entry.teamId ? `${entry.teamId} ${formatAmount(entry.price)}` : 'Unsold'}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Summary({ game, setGame }) {
  const unsold = unsoldPlayerIds(game);
  const allSales = game.teams.flatMap((t) => t.squad);
  const top = [...allSales].sort((a, b) => b.price - a.price)[0];

  return (
    <main className="summary">
      <div className="summary-head">
        <h2>Auction complete</h2>
        {top && (
          <p>
            Top buy: {getPlayer(top.playerId).name} for {formatAmount(top.price)}.
            {unsold.length > 0 &&
              ` ${unsold.length} ${unsold.length === 1 ? 'player' : 'players'} went unsold.`}
          </p>
        )}
        {unsold.length > 0 && (
          <button className="primary" onClick={() => setGame((g) => reauctionUnsold(g))}>
            Re-auction {unsold.length} unsold players
          </button>
        )}
      </div>
      <div className="squads">
        {game.teams.map((t) => (
          <section key={t.id} className="squad" style={{ '--team': t.color }}>
            <h3>
              {t.name}
              <span>{formatAmount(t.purse)} left</span>
            </h3>
            {t.squad.length === 0 ? (
              <p className="muted">No players bought.</p>
            ) : (
              <ul>
                {[...t.squad]
                  .sort((a, b) => b.price - a.price)
                  .map((s) => {
                    const pl = getPlayer(s.playerId);
                    return (
                      <li key={s.playerId}>
                        <span>
                          {pl.name}
                          {pl.overseas && <span className="tag">OS</span>}
                        </span>
                        <span>{formatAmount(s.price)}</span>
                      </li>
                    );
                  })}
              </ul>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
