import { useEffect, useMemo, useRef, useState } from 'react';
import { MAX_SQUAD, MAX_OVERSEAS } from '../data.js';
import {
  formatAmount,
  getPlayer,
  validBidAmounts,
  bidBlockReason,
  maxBid,
  overseasCount,
} from '../auction.js';
import { net, roomContext, serverNow } from '../net.js';
import { sounds, isMuted, setMuted } from '../sound.js';
import { TeamMark, Avatar, Ring, teamById, roleShort } from './parts.jsx';
import TeamDrawer from './TeamDrawer.jsx';
import Chat from './Chat.jsx';

const REACTIONS = ['🔥', '👏', '😂', '😱', '💸'];

function useNow(ms = 200) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function useShortlist() {
  const [list, setList] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('ipl-shortlist')) ?? []);
    } catch {
      return new Set();
    }
  });
  const toggle = (id) =>
    setList((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem('ipl-shortlist', JSON.stringify([...next]));
      } catch {
        // Ignore storage errors.
      }
      return next;
    });
  return [list, toggle];
}

export default function AuctionRoom({ room }) {
  const { game, flash, settings } = room;
  const { lot } = game;
  const player = getPlayer(lot.playerId);
  const { isHost, myTeams, ownerOf, memberName } = roomContext(room);
  const now = useNow();
  const [drawerTeam, setDrawerTeam] = useState(null);
  const [tab, setTab] = useState('next');
  const [shortlist, toggleShortlist] = useShortlist();
  const [muted, setMutedState] = useState(isMuted());
  const [seenChat, setSeenChat] = useState(room.chat.length ? room.chat[room.chat.length - 1].id : 0);

  const paused = room.pausedRemaining !== null;
  const remaining = paused ? room.pausedRemaining : room.deadline ? room.deadline - now : 0;
  const seconds = Math.max(0, Math.ceil(remaining / 1000));
  const lotMs = settings.timerSeconds * 1000;
  const leader = lot.bidder ? teamById(lot.bidder) : null;
  const [next, jump] = validBidAmounts(lot);

  const callout = flash
    ? 'Hammer'
    : paused
      ? 'Paused'
      : seconds === 3
        ? 'Going once'
        : seconds === 2
          ? 'Going twice'
          : seconds <= 1
            ? 'Last call'
            : `${seconds}s`;

  // Sounds follow what everyone sees: bids, the countdown and the hammer.
  const lastBids = useRef(lot.bids.length);
  const lastFlash = useRef(null);
  const lastSecond = useRef(seconds);
  useEffect(() => {
    if (lot.bids.length > lastBids.current) sounds.bid();
    lastBids.current = lot.bids.length;
  }, [lot.bids.length]);
  useEffect(() => {
    lastBids.current = 0;
  }, [lot.playerId]);
  useEffect(() => {
    if (flash && lastFlash.current !== flash.until) {
      if (flash.teamId && myTeams.includes(flash.teamId)) sounds.win();
      else sounds.gavel();
    }
    lastFlash.current = flash?.until ?? null;
  }, [flash, myTeams]);
  useEffect(() => {
    if (!flash && !paused && seconds <= 3 && seconds > 0 && seconds !== lastSecond.current) sounds.tick();
    lastSecond.current = seconds;
  }, [seconds, flash, paused]);

  const bid = (teamId, amount) => {
    sounds.unlock();
    net.act('bid', { teamId, amount });
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea, select, dialog') || e.metaKey || e.ctrlKey) return;
      if (myTeams.length !== 1) return;
      const key = e.key.toLowerCase();
      if (key === 'b' || key === ' ') {
        e.preventDefault();
        bid(myTeams[0], next);
      } else if (key === 'j') {
        bid(myTeams[0], jump);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const unreadChat = room.chat.filter((m) => m.id > seenChat && m.memberId !== room.you).length;
  useEffect(() => {
    if (tab === 'chat' && room.chat.length) setSeenChat(room.chat[room.chat.length - 1].id);
  }, [tab, room.chat]);

  const flashPlayer = flash && getPlayer(flash.playerId);
  const flashMine = flash?.teamId && myTeams.includes(flash.teamId);
  const onShortlist = shortlist.has(player.id);

  return (
    <div className="room">
      <header className="room-bar">
        <span className="room-code" title="Room code">
          {room.code}
        </span>
        <span className="room-progress">
          {game.round === 1 ? 'Main round' : `Unsold round ${game.round - 1}`}
          <span className="muted">
            {' '}
            · Lot {game.lotIndex + 1} of {game.queue.length}
          </span>
        </span>
        <div className="room-actions">
          {isHost && (
            <>
              <button
                className="btn btn-line btn-sm"
                onClick={() => net.act(paused ? 'resume' : 'pause')}
                disabled={!!flash}
              >
                {paused ? 'Resume' : 'Pause'}
              </button>
              <button className="btn btn-line btn-sm" onClick={() => net.act('sell')} disabled={!!flash || paused}>
                {lot.bidder ? 'Sell now' : 'Mark unsold'}
              </button>
            </>
          )}
          <button
            className="btn btn-ghost btn-sm"
            aria-pressed={!muted}
            onClick={() => {
              setMuted(!muted);
              setMutedState(!muted);
              if (muted) sounds.unlock();
            }}
          >
            {muted ? 'Sound off' : 'Sound on'}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (window.confirm('Leave this room? You can rejoin with the room code.')) net.leave();
            }}
          >
            Leave
          </button>
        </div>
      </header>

      <div className="room-grid">
        <section className={`stage ${flash ? 'is-flash' : ''}`} aria-labelledby="lot-name">
          <div className="lot">
            <Avatar player={player} />
            <div className="lot-info">
              <p className="lot-tags">
                <span className="chip">{player.role}</span>
                <span className="chip">{player.country}</span>
                {player.overseas && <span className="chip chip-os">Overseas</span>}
                {onShortlist && <span className="chip chip-star">On your shortlist</span>}
              </p>
              <h2 id="lot-name" className="lot-name">
                {player.name}
              </h2>
              <div className="lot-stats">
                <span>
                  Base <strong>{formatAmount(player.basePrice)}</strong>
                </span>
                <span className="rating">
                  Rating <strong>{player.rating}</strong>
                  <span className="rating-bar" aria-hidden="true">
                    <span style={{ width: `${player.rating}%` }} />
                  </span>
                </span>
                <button
                  className={`star ${onShortlist ? 'on' : ''}`}
                  aria-pressed={onShortlist}
                  onClick={() => toggleShortlist(player.id)}
                >
                  {onShortlist ? '★ Shortlisted' : '☆ Shortlist'}
                </button>
              </div>
            </div>
          </div>

          <div className="bid-row" style={leader ? { '--team': leader.color } : undefined}>
            <div className="bid-main">
              <p className="bid-label">{leader ? 'Current bid' : 'Opening bid'}</p>
              <p className={`bid-amount ${lot.bid === null ? 'is-open' : ''}`} aria-live="polite">
                {formatAmount(lot.bid ?? next)}
              </p>
              <p className="bid-leader">
                {leader ? (
                  <>
                    <TeamMark teamId={leader.id} size="sm" />
                    <span>
                      {ownerOf(leader.id) ? `${ownerOf(leader.id)} for ${leader.name}` : leader.name}
                    </span>
                  </>
                ) : (
                  <span className="muted">Waiting for the first paddle</span>
                )}
              </p>
            </div>
            <Ring
              fraction={flash ? 0 : remaining / lotMs}
              label={callout}
              sub={!flash && !paused && seconds > 3 ? 'to hammer' : null}
              late={!flash && !paused && seconds <= 3}
            />
          </div>

          {lot.bids.length > 0 && (
            <ol className="bid-trail" aria-label="Bids on this player">
              {[...lot.bids]
                .reverse()
                .slice(0, 8)
                .map((b, i) => (
                  <li key={`${b.teamId}-${b.amount}`} className={i === 0 ? 'top' : ''}>
                    <TeamMark teamId={b.teamId} size="xs" />
                    {formatAmount(b.amount)}
                  </li>
                ))}
            </ol>
          )}

          {flash && (
            <div className={`stamp ${flash.teamId ? 'sold' : 'unsold'} ${flashMine ? 'mine' : ''}`} role="status">
              {flash.teamId ? (
                <>
                  <span className="stamp-word">{flashMine ? 'Yours' : 'Sold'}</span>
                  <span className="stamp-detail">
                    {flashPlayer.name} to {flash.teamId} for {formatAmount(flash.price)}
                  </span>
                </>
              ) : (
                <>
                  <span className="stamp-word">Unsold</span>
                  <span className="stamp-detail">{flashPlayer.name}</span>
                </>
              )}
            </div>
          )}

          <Reactions room={room} memberName={memberName} />
        </section>

        <BidConsole
          room={room}
          myTeams={myTeams}
          next={next}
          jump={jump}
          locked={!!flash || paused}
          onBid={bid}
        />

        <aside className="side" aria-label="Auction details">
          <div className="tabs" role="tablist">
            {[
              ['next', 'Up next'],
              ['sold', 'Sold'],
              ['chat', unreadChat ? `Chat (${unreadChat})` : 'Chat'],
            ].map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? 'on' : ''}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="tab-body" role="tabpanel">
            {tab === 'next' && <UpNext game={game} shortlist={shortlist} toggle={toggleShortlist} />}
            {tab === 'sold' && <SoldLog game={game} />}
            {tab === 'chat' && <Chat room={room} memberName={memberName} />}
          </div>
        </aside>

        <TeamRail room={room} leaderId={lot.bidder} ownerOf={ownerOf} onOpen={setDrawerTeam} />
      </div>

      {drawerTeam && (
        <TeamDrawer
          team={game.teams.find((t) => t.id === drawerTeam)}
          owner={ownerOf(drawerTeam)}
          startPurse={game.startPurse}
          onClose={() => setDrawerTeam(null)}
        />
      )}
    </div>
  );
}

function BidConsole({ room, myTeams, next, jump, locked, onBid }) {
  const { game } = room;
  if (myTeams.length === 0) {
    return (
      <section className="console console-empty">
        <p>You are watching this auction. Join a team in the next room to bid.</p>
        <ReactionBar />
      </section>
    );
  }
  return (
    <section className="console" aria-label="Your bids">
      {myTeams.map((teamId) => {
        const team = game.teams.find((t) => t.id === teamId);
        const reasonNext = bidBlockReason(game, teamId, next);
        const reasonJump = bidBlockReason(game, teamId, jump);
        const leading = game.lot.bidder === teamId;
        return (
          <div key={teamId} className="console-team" style={{ '--team': team.color, '--team-ink': team.ink }}>
            <div className="console-info">
              <TeamMark teamId={teamId} />
              <dl>
                <div>
                  <dt>Purse</dt>
                  <dd>{formatAmount(team.purse)}</dd>
                </div>
                <div>
                  <dt>Max bid</dt>
                  <dd>{formatAmount(Math.max(0, maxBid(team)))}</dd>
                </div>
                <div>
                  <dt>Squad</dt>
                  <dd>
                    {team.squad.length}/{MAX_SQUAD}
                  </dd>
                </div>
                <div>
                  <dt>Overseas</dt>
                  <dd>
                    {overseasCount(team)}/{MAX_OVERSEAS}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="console-buttons">
              <button
                className={`paddle ${leading ? 'is-leading' : ''}`}
                disabled={locked || !!reasonNext}
                onClick={() => onBid(teamId, next)}
              >
                <span className="paddle-top">{leading ? 'You lead' : 'Raise paddle'}</span>
                <span className="paddle-amount">
                  {leading ? 'Highest bid' : reasonNext ?? `Bid ${formatAmount(next)}`}
                </span>
              </button>
              <button
                className="paddle paddle-jump"
                disabled={locked || !!reasonJump}
                onClick={() => onBid(teamId, jump)}
              >
                <span className="paddle-top">Jump</span>
                <span className="paddle-amount">{formatAmount(jump)}</span>
              </button>
            </div>
          </div>
        );
      })}
      <div className="console-foot">
        <ReactionBar />
        {myTeams.length === 1 && (
          <p className="keys">
            Keyboard: <kbd>B</kbd> bid, <kbd>J</kbd> jump
          </p>
        )}
      </div>
    </section>
  );
}

function ReactionBar() {
  return (
    <div className="reaction-bar" aria-label="Send a reaction">
      {REACTIONS.map((emoji) => (
        <button key={emoji} onClick={() => net.act('react', { emoji })} aria-label={`React ${emoji}`}>
          {emoji}
        </button>
      ))}
    </div>
  );
}

function Reactions({ room, memberName }) {
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  if (reduced) return null;
  return (
    <div className="floaters" aria-hidden="true">
      {room.reactions.map((r) => (
        <span key={r.id} className="floater" style={{ '--x': `${(r.id * 37) % 80 + 10}%` }}>
          <span className="floater-emoji">{r.emoji}</span>
          <span className="floater-name">{memberName(r.memberId)}</span>
        </span>
      ))}
    </div>
  );
}

function TeamRail({ room, leaderId, ownerOf, onOpen }) {
  const { game } = room;
  return (
    <section className="rail" aria-label="All teams">
      {game.teams.map((t) => {
        const owner = ownerOf(t.id);
        const mine = room.claims[t.id] === room.you;
        return (
          <button
            key={t.id}
            className={`rail-team ${t.id === leaderId ? 'leading' : ''} ${mine ? 'mine' : ''}`}
            style={{ '--team': t.color }}
            onClick={() => onOpen(t.id)}
            aria-label={`${t.name}, ${formatAmount(t.purse)} left, ${t.squad.length} players. Show squad.`}
          >
            <span className="rail-top">
              <TeamMark teamId={t.id} size="sm" />
              <span className="rail-owner">{mine ? 'You' : owner ?? 'Computer'}</span>
            </span>
            <span className="rail-purse">{formatAmount(t.purse)}</span>
            <span className="purse-bar">
              <span style={{ width: `${(t.purse / game.startPurse) * 100}%` }} />
            </span>
            <span className="rail-meta">
              {t.squad.length} players · {overseasCount(t)} OS
            </span>
          </button>
        );
      })}
    </section>
  );
}

function UpNext({ game, shortlist, toggle }) {
  const [query, setQuery] = useState('');
  const upcoming = game.queue.slice(game.lotIndex + 1).map(getPlayer);
  const q = query.trim().toLowerCase();
  const shown = q
    ? upcoming.filter((p) => `${p.name} ${p.role} ${p.country}`.toLowerCase().includes(q))
    : upcoming;
  return (
    <div className="upnext">
      <input
        className="search"
        type="search"
        placeholder={`Search ${upcoming.length} players still to come`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search upcoming players"
      />
      {shown.length === 0 ? (
        <p className="muted empty">{upcoming.length ? 'No upcoming player matches that.' : 'This is the last player.'}</p>
      ) : (
        <ul className="plist">
          {shown.slice(0, 40).map((p) => (
            <li key={p.id}>
              <Avatar player={p} size="sm" />
              <span className="plist-name">
                {p.name}
                <span className="muted">
                  {roleShort(p.role)} · {p.country}
                </span>
              </span>
              <span className="plist-price">{formatAmount(p.basePrice)}</span>
              <button
                className={`star star-sm ${shortlist.has(p.id) ? 'on' : ''}`}
                aria-pressed={shortlist.has(p.id)}
                aria-label={`${shortlist.has(p.id) ? 'Remove' : 'Add'} ${p.name} ${shortlist.has(p.id) ? 'from' : 'to'} shortlist`}
                onClick={() => toggle(p.id)}
              >
                {shortlist.has(p.id) ? '★' : '☆'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SoldLog({ game }) {
  if (game.log.length === 0) return <p className="muted empty">Sales show up here as the hammer falls.</p>;
  return (
    <ul className="plist">
      {game.log.slice(0, 40).map((e, i) => {
        const p = getPlayer(e.playerId);
        return (
          <li key={`${e.playerId}-${e.round}-${i}`}>
            <Avatar player={p} size="sm" />
            <span className="plist-name">
              {p.name}
              <span className="muted">{roleShort(p.role)}</span>
            </span>
            {e.teamId ? (
              <span className="plist-sale">
                <TeamMark teamId={e.teamId} size="xs" />
                {formatAmount(e.price)}
              </span>
            ) : (
              <span className="muted">Unsold</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
