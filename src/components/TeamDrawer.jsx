import { useEffect, useRef } from 'react';
import { MAX_SQUAD, MAX_OVERSEAS, ROLES } from '../data.js';
import { formatAmount, getPlayer, overseasCount, squadRating, roleCounts } from '../auction.js';
import { TeamMark } from './parts.jsx';

export default function TeamDrawer({ team, owner, startPurse, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  const counts = roleCounts(team);
  const spent = startPurse - team.purse;

  return (
    <dialog
      ref={ref}
      className="drawer"
      style={{ '--team': team.color }}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="drawer-title"
    >
      <div className="drawer-inner">
        <header className="drawer-head">
          <TeamMark teamId={team.id} size="lg" />
          <div>
            <h2 id="drawer-title">{team.name}</h2>
            <p className="muted">{owner ? `Played by ${owner}` : 'Played by the computer'}</p>
          </div>
          <button className="btn btn-ghost btn-sm drawer-close" onClick={onClose}>
            Close
          </button>
        </header>
        <dl className="drawer-stats">
          <div>
            <dt>Purse left</dt>
            <dd>{formatAmount(team.purse)}</dd>
          </div>
          <div>
            <dt>Spent</dt>
            <dd>{formatAmount(spent)}</dd>
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
          <div>
            <dt>Best XI rating</dt>
            <dd>{squadRating(team)}</dd>
          </div>
        </dl>
        {team.squad.length === 0 ? (
          <p className="muted empty">No players bought yet.</p>
        ) : (
          ROLES.filter((role) => counts[role] > 0).map((role) => (
            <section key={role} className="drawer-role">
              <h3>
                {role === 'All-rounder' ? 'All-rounders' : `${role}s`} <span className="muted">{counts[role]}</span>
              </h3>
              <ul className="plist">
                {team.squad
                  .filter((s) => getPlayer(s.playerId).role === role)
                  .sort((a, b) => b.price - a.price)
                  .map((s) => {
                    const p = getPlayer(s.playerId);
                    return (
                      <li key={s.playerId}>
                        <span className="plist-name">
                          {p.name}
                          {p.overseas && <span className="muted">Overseas</span>}
                        </span>
                        <span className="plist-price">{formatAmount(s.price)}</span>
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))
        )}
      </div>
    </dialog>
  );
}
