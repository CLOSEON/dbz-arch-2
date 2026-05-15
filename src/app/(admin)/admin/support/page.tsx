'use client';

import { useState, useEffect, useMemo } from 'react';
import { getAllTickets, updateTicketStatus, addTicketReply } from '@/lib/queries/support';
import { SupportTicket, TicketStatus, UserRole } from '@/types';
import { useUiStore } from '@/store/uiStore';
import { MessageSquare, Clock, CheckCircle, Send, User } from 'lucide-react';
import { SkeletonList } from '@/components/shared/Skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { formatDate } from '@/lib/utils';

export default function AdminSupport() {
  const addToast = useUiStore((s) => s.addToast);

  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [filter, setFilter] = useState<TicketStatus | 'all'>('open');
  
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadTickets();
  }, []);

  async function loadTickets() {
    setLoading(true);
    try {
      const list = await getAllTickets('all');
      setTickets(list);
    } catch (err) {
      addToast('Failed to load tickets', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendReply() {
    if (!selectedTicket || !replyText.trim()) return;
    setSending(true);
    try {
      await addTicketReply(
        selectedTicket.id,
        {
          from_role: 'admin',
          from_name: 'Dabzo Admin',
          message: replyText.trim(),
        },
        selectedTicket.replies
      );
      addToast('Reply sent', 'success');
      setReplyText('');
      // Update local state
      const updatedTickets = tickets.map(t => 
        t.id === selectedTicket.id 
          ? { ...t, status: 'in_progress' as TicketStatus, replies: [...t.replies, { from_role: 'admin' as UserRole, from_name: 'Dabzo Admin', message: replyText.trim(), timestamp: { seconds: Date.now()/1000, nanoseconds: 0 } as any }] }
          : t
      );
      setTickets(updatedTickets);
      setSelectedTicket(updatedTickets.find(t => t.id === selectedTicket.id) || null);
    } catch (err) {
      addToast('Failed to send reply', 'error');
    } finally {
      setSending(false);
    }
  }

  async function handleResolve(ticketId: string) {
    try {
      await updateTicketStatus(ticketId, 'resolved');
      addToast('Ticket resolved', 'success');
      setTickets(tickets.map(t => t.id === ticketId ? { ...t, status: 'resolved' as TicketStatus } : t));
      if (selectedTicket?.id === ticketId) setSelectedTicket(null);
    } catch (err) {
      addToast('Failed to resolve', 'error');
    }
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return tickets;
    return tickets.filter(t => t.status === filter);
  }, [tickets, filter]);

  if (selectedTicket) {
    return (
      <div className="space-y-6 animate-fade-in pb-10">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => setSelectedTicket(null)} className="p-2 -ml-2 text-slate-400 hover:text-brand">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-extrabold text-slate-900">Ticket Details</h1>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-card border border-slate-50 space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-lg mb-2 inline-block ${
                selectedTicket.status === 'open' ? 'bg-rose-50 text-rose-500' :
                selectedTicket.status === 'in_progress' ? 'bg-brand-50 text-brand' : 'bg-emerald-50 text-emerald-500'
              }`}>
                {selectedTicket.status}
              </span>
              <h2 className="text-lg font-bold text-slate-900">{selectedTicket.subject}</h2>
              <div className="flex items-center gap-2 mt-1">
                <User className="w-3 h-3 text-slate-400" />
                <span className="text-xs text-slate-500 font-medium">{selectedTicket.submitter_name} ({selectedTicket.role})</span>
              </div>
            </div>
            {selectedTicket.status !== 'resolved' && (
              <button
                onClick={() => handleResolve(selectedTicket.id)}
                className="text-xs font-bold text-emerald-500 bg-emerald-50 px-3 py-1.5 rounded-xl hover:bg-emerald-100"
              >
                Resolve
              </button>
            )}
          </div>

          <div className="bg-slate-50 rounded-2xl p-4">
            <p className="text-sm text-slate-700 leading-relaxed">{selectedTicket.message}</p>
            <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-wider">{formatDate(selectedTicket.created_at)}</p>
          </div>

          {/* Replies */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Conversation</h3>
            {selectedTicket.replies.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No replies yet.</p>
            ) : (
              <div className="space-y-4">
                {selectedTicket.replies.map((reply, i) => (
                  <div key={i} className={`flex flex-col ${reply.from_role === 'admin' ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                      reply.from_role === 'admin' ? 'bg-brand text-white' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {reply.message}
                    </div>
                    <span className="text-[9px] text-slate-400 mt-1 font-bold uppercase tracking-wider">
                      {reply.from_name} • {formatDate(reply.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Reply Form */}
          {selectedTicket.status !== 'resolved' && (
            <div className="pt-4 flex gap-2">
              <input
                className="flex-1 bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-brand/20 transition-all outline-none"
                placeholder="Type your reply…"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
              />
              <button
                onClick={handleSendReply}
                disabled={sending || !replyText.trim()}
                className="w-12 h-12 bg-brand text-white rounded-2xl flex items-center justify-center disabled:opacity-50 active:scale-95 transition-all shadow-lg shadow-brand/20"
              >
                {sending ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Support</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage customer inquiries</p>
      </div>

      <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
        {(['open', 'in_progress', 'resolved', 'all'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${
              filter === s ? 'bg-white text-brand shadow-sm' : 'text-slate-500'
            }`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonList count={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="💬"
          title="No tickets found"
          description={`No ${filter} tickets at the moment.`}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <div 
              key={t.id} 
              onClick={() => setSelectedTicket(t)}
              className="bg-white rounded-3xl p-5 shadow-card border border-slate-50 cursor-pointer hover:border-brand/30 active:scale-[0.98] transition-all group"
            >
              <div className="flex justify-between items-start mb-2">
                <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-lg ${
                  t.status === 'open' ? 'bg-rose-50 text-rose-500' :
                  t.status === 'in_progress' ? 'bg-brand-50 text-brand' : 'bg-emerald-50 text-emerald-500'
                }`}>
                  {t.status}
                </span>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{formatDate(t.created_at)}</span>
              </div>
              <h4 className="font-bold text-slate-900 group-hover:text-brand transition-colors">{t.subject}</h4>
              <p className="text-xs text-slate-500 line-clamp-1 mt-1">{t.message}</p>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                <div className="w-6 h-6 rounded-lg bg-slate-50 flex items-center justify-center text-xs">
                  <User className="w-3 h-3 text-slate-400" />
                </div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{t.submitter_name} ({t.role})</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
