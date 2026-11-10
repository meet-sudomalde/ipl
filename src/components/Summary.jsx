import { useState } from 'react';
import { ROLES } from '../data.js';
import { formatAmount, getPlayer, squadRating, roleCounts, unsoldPlayerIds, overseasCount } from '../auction.js';
import { net, roomContext, copyText, toast } from '../net.js';
import { TeamMark } from './parts.jsx';
import TeamDrawer from './TeamDrawer.jsx';
import Chat from './Chat.jsx';

export default function Summary({ room }) {
  const { game } = room;
  const { isHost, ownerOf, memberName } = roomContext(room);
  const [drawerTeam, setDrawerTeam] = useState(null);
  const unsold = unsoldPlayerIds(game);
  const ranked = [...game.teams].sort((a, b) => squadRating(b) - squadRating(a) || b.purse - a.purse);
  const sales = game.teams.flatMap((t) => t.squad.map((s) => ({ ...s, teamId: t.id })));
  const top = [...sales].sort((a, b) => b.price - a.price)[0];
  const bargain = [...sales]
    .filter((s) => getPlayer(s.playerId).rating >= 80)
    .sort((a, b) => a.price / getPlayer(a.playerId).rating - b.price / getPlayer(b.playerId).rating)[0];
  const spender = [...game.teams].sort((a, b) => a.purse - b.purse)[0];

  const shareText = () =>
    [
      `IPL Auction results (room ${room.code})`,
      '',
      ...ranked.map((t, i) => {
        const owner = ownerOf(t.id);
        const buys = [...t.squad]
          .sort((a, b) => b.price - a.price)
          .slice(0, 5)
          .map((s) => `${getPlayer(s.playerId).name} ${formatAmount(s.price)}`)
          .join(', ');
        return `${i + 1}. ${t.id}${owner ? ` (${owner})` : ''}: rating ${squadRating(t)}, ${t.squad.length} players, ${formatAmount(t.purse)} left${buys ? `. Top buys: ${buys}` : ''}`;
      }),
    ].join('\n');

  return (
    <main className="summary">
      <header className="summary-head">
        <div>
          <h2>Auction complete</h2>
          <p className="muted">
            {sales.length} players sold
            {unsold.length > 0 && `, ${unsold.length} unsold`}. Tap a team to see its full squad.
          </p>
        </div>
        <div className="summary-actions">
          <button
            className="btn btn-line"
            onClick={async () =>
              toast((await copyText(shareText())) ? 'Results copied. Paste them in your group chat.' : 'Copy failed', 'ok')
            }
          >
            Copy results
          </button>
          {isHost && unsold.length > 0 && (
            <button className="btn btn-gold" onClick={() => net.act('reauction')}>
              Re-auction {unsold.length} unsold
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => net.leave()}>
            Leave room
          </button>
        </div>
      </header>

      {sales.length > 0 && (
        <section className="awards" aria-label="Highlights">
          {top && (
            <Award title="Top buy" teamId={top.teamId}>
              {getPlayer(top.playerId).name} for {formatAmount(top.price)}
            </Award>
          )}
          {bargain && (
            <Award title="Steal of the auction" teamId={bargain.teamId}>
              {getPlayer(bargain.playerId).name} for {formatAmount(bargain.price)}
            </Award>
          )}
          <Award title="Biggest spender" teamId={spender.id}>
            {formatAmount(game.startPurse - spender.purse)} spent
          </Award>
        </section>
      )}

      <section className="table-wrap" aria-labelledby="standings-title">
        <h3 id="standings-title">Standings by best XI rating</h3>
        <ol className="standings">
          {ranked.map((t, i) => {
            const counts = roleCounts(t);
            return (
              <li key={t.id} style={{ '--team': t.color }}>
                <button className="standing" onClick={() => setDrawerTeam(t.id)}>
                  <span className="standing-rank">{i + 1}</span>
                  <TeamMark teamId={t.id} />
                  <span className="standing-name">
                    {t.name}
                    <span className="muted">{ownerOf(t.id) ?? 'Computer'}</span>
                  </span>
                  <span className="standing-roles" aria-label="Players by role">
                    {ROLES.map((r) => (
                      <span key={r} title={r}>
                        {counts[r]}
                        <small>{r === 'Wicketkeeper' ? 'WK' : r === 'All-rounder' ? 'AR' : r === 'Batter' ? 'BAT' : 'BOWL'}</small>
                      </span>
                    ))}
                  </span>
                  <span className="standing-num">
                    {t.squad.length}
                    <small>players</small>
                  </span>
                  <span className="standing-num">
                    {overseasCount(t)}
                    <small>overseas</small>
                  </span>
                  <span className="standing-num">
                    {formatAmount(t.purse)}
                    <small>left</small>
                  </span>
                  <span className="standing-rating">{squadRating(t)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="summary-chat" aria-label="Room chat">
        <h3>Room chat</h3>
        <Chat room={room} memberName={memberName} />
      </section>

      {drawerTeam && (
        <TeamDrawer
          team={game.teams.find((t) => t.id === drawerTeam)}
          owner={ownerOf(drawerTeam)}
          startPurse={game.startPurse}
          onClose={() => setDrawerTeam(null)}
        />
      )}
    </main>
  );
}

function Award({ title, teamId, children }) {
  return (
    <div className="award">
      <p className="award-title">{title}</p>
      <p className="award-body">{children}</p>
      <TeamMark teamId={teamId} size="sm" />
    </div>
  );
}
