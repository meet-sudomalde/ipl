import { useEffect, useRef, useState } from 'react';
import { net } from '../net.js';

export default function Chat({ room, memberName }) {
  const [text, setText] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [room.chat.length]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const result = await net.act('chat', { text });
    if (result.ok) setText('');
  };

  return (
    <div className="chat">
      <ol className="chat-list" ref={listRef} aria-live="polite">
        {room.chat.length === 0 && <li className="muted empty">Say something. Trash talk is encouraged.</li>}
        {room.chat.map((m) => (
          <li key={m.id} className={m.memberId === room.you ? 'mine' : ''}>
            <span className="chat-name">{m.memberId === room.you ? 'You' : memberName(m.memberId)}</span>
            <span className="chat-text">{m.text}</span>
          </li>
        ))}
      </ol>
      <form className="chat-form" onSubmit={send}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
          placeholder="Message the room"
          aria-label="Message the room"
        />
        <button className="btn btn-gold btn-sm" disabled={!text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
