'use client';

import { useState } from 'react';
import { Bell, Send, Users, Store, Truck, Info } from 'lucide-react';
import { useUiStore } from '@/store/uiStore';

export default function AdminNotificationsPage() {
  const addToast = useUiStore((s) => s.addToast);
  const [target, setTarget] = useState<'all' | 'users' | 'vendors' | 'delivery'>('all');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !message) {
      addToast('Please fill all fields', 'warning');
      return;
    }
    setLoading(true);
    try {
      const { sendNotification } = await import('@/lib/queries/notifications');
      await sendNotification({
        target,
        title,
        message,
      });
      addToast(`Notification sent to ${target}! 🔔`, 'success');
      setTitle('');
      setMessage('');
    } catch (err) {
      addToast('Failed to send notification', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-10 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Push Notifications</h1>
        <p className="text-sm text-slate-500 mt-0.5">Send system-wide alerts and updates</p>
      </div>

      <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100">
        <form onSubmit={handleSend} className="space-y-6">
          {/* Target Selection */}
          <div className="space-y-3">
            <label className="label ml-1">Send To</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'all', label: 'Everyone', icon: Users },
                { id: 'users', label: 'Customers', icon: Users },
                { id: 'vendors', label: 'Vendors', icon: Store },
                { id: 'delivery', label: 'Delivery', icon: Truck },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTarget(item.id as any)}
                  className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                    target === item.id 
                      ? 'border-brand bg-brand/5 text-brand shadow-sm' 
                      : 'border-slate-50 bg-slate-50 text-slate-400 hover:border-slate-200'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="text-xs font-bold">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label ml-1">Notification Title</label>
              <input
                className="input"
                placeholder="e.g. New Feature Released!"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="label ml-1">Message Body</label>
              <textarea
                className="input min-h-[120px] resize-none"
                placeholder="Write your message here…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary flex items-center justify-center gap-2 h-14"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <><Send className="w-4 h-4" /> Broadcast Notification</>
            )}
          </button>
        </form>
      </div>

      <div className="bg-brand-50 rounded-3xl p-5 border border-brand-100 flex gap-4">
        <div className="w-10 h-10 rounded-xl bg-white text-brand-600 flex items-center justify-center shrink-0 shadow-sm">
          <Info className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-brand-900">Notification Tip</h4>
          <p className="text-xs text-brand-600 leading-relaxed mt-0.5">
            Keep titles short and messages actionable to improve click-through rates. Broad notifications are sent instantly to all online users.
          </p>
        </div>
      </div>
    </div>
  );
}
