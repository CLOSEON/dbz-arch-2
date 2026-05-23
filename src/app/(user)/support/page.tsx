'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { submitTicket, getMyTickets } from '@/lib/queries/support';
import { SkeletonList } from '@/components/shared/Skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { formatDate, ticketStatusColor, ticketStatusLabel } from '@/lib/utils';
import type { SupportTicket } from '@/types';

export default function SupportPage() {
  const user = useAuthStore((s) => s.user);
  const addToast = useUiStore((s) => s.addToast);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [formVisible, setFormVisible] = useState(true);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (user) loadTickets(); }, [user]);

  async function loadTickets() {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getMyTickets(user.id);
      setTickets(data);
    } catch { addToast('Failed to load tickets', 'error'); }
    finally { setLoading(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject || !message) { addToast('Fill all fields', 'warning'); return; }
    setSubmitting(true);
    try {
      await submitTicket({ submitter_id: user!.id, submitter_name: user!.name, role: 'user', subject, message });
      addToast("Ticket submitted! We'll respond soon.", 'success');
      setSubject(''); setMessage('');
      loadTickets();
    } catch { addToast('Failed to submit', 'error'); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-5 gap-3">
        <div>
          <h1 className="text-[30px] sm:text-[36px] font-black text-slate-900 tracking-tight leading-tight">Help & Support</h1>
          <p className="text-sm text-slate-500">We&apos;re here to help</p>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none mb-5 px-1">
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-brand/10 text-brand">
          Open: {tickets.filter(t => t.status === 'open').length}
        </span>
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-600">
          In Progress: {tickets.filter(t => t.status === 'in_progress').length}
        </span>
      </div>

      {/* New Ticket Form */}
      <div className="bg-white rounded-3xl shadow-card p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-900">New Request</h3>
          <button className="btn-ghost text-xs py-1" onClick={() => setFormVisible(!formVisible)}>
            {formVisible ? 'Hide' : 'New Ticket'}
          </button>
        </div>
        {formVisible && (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Subject</label>
              <input className="input" placeholder="What's the issue?" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Message</label>
              <textarea
                className="input min-h-[100px] resize-none"
                placeholder="Describe your problem in detail…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit Request'}
            </button>
          </form>
        )}
      </div>

      {/* Ticket List */}
      <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-3">My Tickets</h2>
      {loading ? (
        <SkeletonList count={2} />
      ) : tickets.length === 0 ? (
        <EmptyState icon="💬" title="No tickets yet" description="Submit a request above and we'll help you out." />
      ) : (
        <div className="space-y-3">
          {tickets.map((t, i) => (
            <div key={t.id} className="card animate-fade-up" style={{ animationDelay: `${i * 0.04}s` }}>
              <div className="flex items-start justify-between mb-2">
                <h4 className="font-bold text-slate-900 text-sm flex-1 mr-2">{t.subject}</h4>
                <span className={`badge text-xs ${ticketStatusColor(t.status)}`}>
                  {ticketStatusLabel(t.status)}
                </span>
              </div>
              <p className="text-xs text-slate-600 line-clamp-2 mb-2">{t.message}</p>
              <p className="text-xs text-slate-400">{formatDate(t.created_at)}</p>
              {t.replies?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                  {t.replies.map((r, ri) => (
                    <div key={ri} className={`rounded-xl px-3 py-2 text-xs ${r.from_role === 'admin' ? 'bg-brand-50 text-brand-700' : 'bg-slate-50 text-slate-700'}`}>
                      <span className="font-semibold">{r.from_name}: </span>{r.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
