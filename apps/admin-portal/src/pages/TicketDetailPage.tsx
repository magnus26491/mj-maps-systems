// src/pages/TicketDetailPage.tsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTicket, replyTicket, updateTicket } from '../api';
import type { Ticket, TicketMessage } from '../types';

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!id) return;
    getTicket(id)
      .then(r => { setTicket(r.ticket); setMessages(r.messages); })
      .catch((e: Error) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleReply() {
    if (!id || !replyText.trim()) return;
    setSending(true);
    try {
      await replyTicket(id, replyText.trim());
      // Reload
      const r = await getTicket(id);
      setMessages(r.messages);
      setTicket(r.ticket);
      setReplyText('');
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function handleStatusChange(status: string) {
    if (!id) return;
    try {
      await updateTicket(id, { status });
      const r = await getTicket(id);
      setTicket(r.ticket);
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  }

  async function handleAssign(assigneeId: string) {
    if (!id) return;
    try {
      await updateTicket(id, { assigneeId: assigneeId || null });
      const r = await getTicket(id);
      setTicket(r.ticket);
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  }

  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="page-body"><div className="login-error">{error}</div></div>;
  if (!ticket) return null;

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <button className="btn btn-sm btn-secondary" onClick={() => navigate('/tickets')} style={{ marginBottom: '0.5rem' }}>
              ← Tickets
            </button>
            <h1>{ticket.subject}</h1>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>
              #{ticket.id} · {ticket.userEmail}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={`badge ${ticket.status === 'open' ? 'red' : ticket.status === 'pending' ? 'amber' : 'green'}`}>
              {ticket.status}
            </span>
            <span className={`badge ${ticket.priority === 'urgent' ? 'red' : ticket.priority === 'high' ? 'amber' : 'muted'}`}>
              {ticket.priority}
            </span>
          </div>
        </div>
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Ticket meta */}
        <div className="card">
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', display: 'block', marginBottom: '0.25rem' }}>Status</label>
              <select
                value={ticket.status}
                onChange={e => handleStatusChange(e.target.value)}
                style={{ width: 'auto' }}
              >
                <option value="open">Open</option>
                <option value="pending">Pending</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', display: 'block', marginBottom: '0.25rem' }}>Assignee</label>
              <input
                type="text"
                value={ticket.assigneeEmail ?? ''}
                placeholder="Email to assign…"
                style={{ width: '200px' }}
                onBlur={e => {
                  if (e.target.value) handleAssign(e.target.value);
                  else handleAssign('');
                }}
              />
            </div>
            <div style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>
              Created {new Date(ticket.createdAt).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Message thread */}
        <div>
          <div className="section-title">Conversation</div>
          <div className="thread">
            {/* Initial user message */}
            <div className="message">
              <div className="message-header">
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{ticket.userEmail}</span>
                <span>{new Date(ticket.createdAt).toLocaleString()}</span>
              </div>
              <div className="message-body">{ticket.body}</div>
            </div>

            {messages.filter(m => m.authorId !== ticket.userId).map(m => (
              <div key={m.id} className="message admin">
                <div className="message-header">
                  <span>{m.authorIsAdmin ? 'Admin' : m.authorEmail}</span>
                  <span>{new Date(m.createdAt).toLocaleString()}</span>
                </div>
                <div className="message-body">{m.body}</div>
              </div>
            ))}

            {/* Existing user replies */}
            {messages.filter(m => !m.authorIsAdmin).map(m => (
              <div key={m.id} className="message">
                <div className="message-header">
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{m.authorEmail}</span>
                  <span>{new Date(m.createdAt).toLocaleString()}</span>
                </div>
                <div className="message-body">{m.body}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Reply form */}
        {ticket.status !== 'closed' && (
          <div className="card">
            <div className="card-title">Reply</div>
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder="Type your reply…"
              rows={4}
              style={{ resize: 'vertical' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
              <button
                className="btn btn-primary"
                disabled={!replyText.trim() || sending}
                onClick={handleReply}
              >
                {sending ? 'Sending…' : 'Send Reply'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}