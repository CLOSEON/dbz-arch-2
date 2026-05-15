'use client';

import { useState } from 'react';
import { HeadphonesIcon, Send, Phone, MessageSquare } from 'lucide-react';
import { useUiStore } from '@/store/uiStore';

import { useAuthStore } from '@/store/authStore';

export default function DeliverySupportPage() {
  const user = useAuthStore((s) => s.user);
  const addToast = useUiStore((s) => s.addToast);
  const [loading, setLoading] = useState(false);
  const [subject, setSubject] = useState('App not working');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    try {
      const { submitTicket } = await import('@/lib/queries/support');
      await submitTicket({
        submitter_id: user.id,
        submitter_name: user.name || 'Delivery Partner',
        role: user.role,
        subject,
        message,
      });
      addToast('Issue reported! Admin will contact you.', 'success');
      setMessage('');
    } catch (err) {
      addToast('Failed to report issue', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Support</h1>
        <p className="text-sm text-slate-500 mt-0.5">Help for delivery partners</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button 
          onClick={() => window.open('tel:+918000000000', '_self')}
          className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center gap-3 active:scale-95 transition-transform"
        >
          <div className="w-10 h-10 rounded-2xl bg-brand-50 text-brand flex items-center justify-center">
            <Phone className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold text-slate-900">Call Admin</span>
        </button>
        <button 
          onClick={() => window.open('https://wa.me/918000000000', '_blank')}
          className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center gap-3 active:scale-95 transition-transform"
        >
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <MessageSquare className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold text-slate-900">WhatsApp</span>
        </button>
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
          <HeadphonesIcon className="w-4 h-4 text-brand" /> Report an Issue
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Issue Type</label>
            <select 
              className="input appearance-none bg-slate-50"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              <option>App not working</option>
              <option>Payment issue</option>
              <option>Customer not responding</option>
              <option>Address incorrect</option>
              <option>Other</option>
            </select>
          </div>
          <div>
            <label className="label">Details</label>
            <textarea
              className="input min-h-[100px] resize-none"
              placeholder="Tell us more…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Sending…' : 'Submit Ticket'}
          </button>
        </form>
      </div>
    </div>
  );
}
