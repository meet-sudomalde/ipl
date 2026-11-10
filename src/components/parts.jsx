import { TEAMS } from '../data.js';

export const teamById = (id) => TEAMS.find((t) => t.id === id);

export function TeamMark({ teamId, size = 'md' }) {
  const team = teamById(teamId);
  return (
    <span
      className={`team-mark team-mark-${size}`}
      style={{ '--team': team.color, '--team-ink': team.ink }}
      title={team.name}
    >
      {team.id}
    </span>
  );
}

export function Avatar({ player, size = 'lg' }) {
  const initials = player.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('');
  return (
    <span className={`avatar avatar-${size} role-${roleClass(player.role)}`} aria-hidden="true">
      {initials}
    </span>
  );
}

export const roleClass = (role) => role.toLowerCase().replace(/[^a-z]/g, '');

const ROLE_SHORT = { Batter: 'BAT', Wicketkeeper: 'WK', 'All-rounder': 'AR', Bowler: 'BOWL' };
export const roleShort = (role) => ROLE_SHORT[role];

export function Ring({ fraction, label, sub, late }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className={`ring ${late ? 'late' : ''}`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="ring-track" cx="60" cy="60" r={r} />
        <circle
          className="ring-fill"
          cx="60"
          cy="60"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, fraction)))}
        />
      </svg>
      <div className="ring-text">
        <span className="ring-label">{label}</span>
        {sub && <span className="ring-sub">{sub}</span>}
      </div>
    </div>
  );
}
