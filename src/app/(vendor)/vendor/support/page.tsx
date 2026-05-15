'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { HeadphonesIcon, Send, MessageCircle } from 'lucide-react';

export default function VendorSupportPage() {
  const user = useAuthStore((s) => s.user);
  const addToast = useUiStore((s) => s.addToast);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    try {
      const { submitTicket } = await import('@/lib/queries/support');
      await submitTicket({
        submitter_id: user.id,
        submitter_name: user.name || 'Vendor',
        role: user.role,
        subject,
        message,
      });
      addToast('Support ticket created! We will get back to you soon.', 'success');
      setSubject('');
      setMessage('');
    } catch (err: any) {
      addToast('Failed to create ticket', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Support</h1>
        <p className="text-sm text-slate-500 mt-0.5">Need help? We're here for you.</p>
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand flex items-center justify-center">
            <HeadphonesIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Contact Admin</h3>
            <p className="text-xs text-slate-500">Expect a response within 2-4 hours</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Subject</label>
            <input
              className="input"
              placeholder="What do you need help with?"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Message</label>
            <textarea
              className="input min-h-[120px] resize-none"
              placeholder="Describe your issue in detail…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary flex items-center justify-center gap-2">
            {loading ? 'Sending…' : <><Send className="w-4 h-4" /> Send Message</>}
          </button>
        </form>
      </div>

      <div className="bg-emerald-50 rounded-3xl p-6 border border-emerald-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white text-emerald-600 flex items-center justify-center shadow-sm">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-900">Quick Support</p>
              <p className="text-[10px] text-emerald-600 font-medium uppercase tracking-wider">WhatsApp Available</p>
            </div>
          </div>
          <button 
            onClick={() => window.open('https://wa.me/918000000000', '_blank')}
            className="bg-white text-emerald-600 px-4 py-2 rounded-xl text-xs font-bold shadow-sm active:scale-95 transition-transform"
          >
            Chat Now
          </button>
        </div>
      </div>
    </div>
  );
}
