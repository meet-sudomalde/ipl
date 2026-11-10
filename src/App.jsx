import { useNet, net } from './net.js';
import Home from './components/Home.jsx';
import Lobby from './components/Lobby.jsx';
import AuctionRoom from './components/AuctionRoom.jsx';
import Summary from './components/Summary.jsx';

export default function App() {
  const { room, connected, rejoining, toasts } = useNet();

  let screen;
  if (rejoining && !room) {
    screen = (
      <main className="splash">
        <p>{connected ? 'Rejoining your room…' : 'Connecting to the auction server…'}</p>
        <button className="btn btn-ghost btn-sm" onClick={() => net.forget()}>
          Start fresh instead
        </button>
      </main>
    );
  } else if (!room) {
    screen = <Home />;
  } else if (room.phase === 'lobby') {
    screen = <Lobby room={room} />;
  } else if (room.game.phase === 'complete') {
    screen = <Summary room={room} />;
  } else {
    screen = <AuctionRoom room={room} />;
  }

  return (
    <>
      {!connected && !rejoining && (
        <div className="offline-banner" role="status">
          Lost connection to the auction server. Trying again…
        </div>
      )}
      {screen}
      <div className="toasts" aria-live="assertive">
        {toasts.map((t) => (
          <p key={t.id} className={`toast toast-${t.tone}`}>
            {t.text}
          </p>
        ))}
      </div>
    </>
  );
}
