'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { getDailyMenu, saveDailyMenu, getTodayStr } from '@/lib/queries/menu';
import { DailyMenu, MenuItem } from '@/types';
import { Utensils, Plus, Trash2, Calendar } from 'lucide-react';

export function TodayMenuCard() {
  const user = useAuthStore((s) => s.user);
  const addToast = useUiStore((s) => s.addToast);

  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState<DailyMenu | null>(null);
  
  // Form state
  const [items, setItems] = useState<MenuItem[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const todayStr = getTodayStr();
  const displayDate = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  useEffect(() => {
    if (user?.id) {
      loadMenu();
    }
  }, [user?.id]);

  async function loadMenu() {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getDailyMenu(user.id, todayStr);
      setMenu(data);
      if (data) {
        setItems(data.items || []);
        setNote(data.note || '');
      } else {
        setItems([{ name: '' }]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function addItem() {
    setItems([...items, { name: '' }]);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, name: string) {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], name };
    setItems(newItems);
  }

  async function handleSave() {
    if (!user) return;
    const filteredItems = items.filter(it => it.name.trim());
    if (filteredItems.length === 0) {
      addToast('Please add at least one item', 'warning');
      return;
    }

    setSaving(true);
    try {
      await saveDailyMenu(user.id, todayStr, {
        items: filteredItems,
        note: note.trim(),
      });
      addToast('Menu saved successfully! 🍱', 'success');
      setEditing(false);
      loadMenu();
    } catch (err) {
      addToast('Failed to save menu', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card animate-pulse">
        <div className="h-6 w-32 bg-slate-100 rounded mb-4" />
        <div className="space-y-3">
          <div className="h-12 bg-slate-50 rounded-2xl" />
          <div className="h-12 bg-slate-50 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
            <Utensils className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 leading-none">Today's Menu</h3>
            <p className="text-xs font-medium text-slate-400 mt-1.5">What are you serving today?</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            {displayDate}
          </span>
        </div>
      </div>

      {editing || !menu ? (
        <div className="space-y-4">
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  className="input flex-1 py-3.5"
                  placeholder="Item name (e.g. Aloo Paratha)"
                  value={item.name}
                  onChange={(e) => updateItem(idx, e.target.value)}
                />
                <button
                  onClick={() => removeItem(idx)}
                  className="w-12 h-12 flex items-center justify-center bg-rose-50 text-rose-500 rounded-2xl shrink-0 hover:bg-rose-100 transition-colors border border-rose-100/50"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addItem}
            className="text-xs font-bold text-brand flex items-center gap-2 px-1 hover:underline group"
          >
            <div className="w-5 h-5 rounded-lg bg-brand/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Plus className="w-3 h-3" />
            </div>
            Add another item
          </button>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5 ml-1">
              Note to customers (optional)
            </label>
            <textarea
              className="input w-full min-h-[100px] py-4 resize-none"
              placeholder="Special instructions or notes…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="flex gap-3 pt-2">
            {menu && (
              <button
                onClick={() => setEditing(false)}
                className="flex-1 py-3.5 h-auto text-sm font-bold text-slate-500 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-[2] btn-primary py-4 h-auto text-sm shadow-xl shadow-brand/20"
            >
              {saving ? 'Saving…' : 'Save Today\'s Menu'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100/50">
            <div className="space-y-2.5">
              {menu.items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand" />
                  <span className="text-sm font-semibold text-slate-700">{item.name}</span>
                </div>
              ))}
            </div>
            {menu.note && (
              <div className="mt-4 pt-4 border-t border-slate-200/50">
                <p className="text-[13px] text-slate-500 italic leading-relaxed">
                  "{menu.note}"
                </p>
              </div>
            )}
          </div>

          <button
            onClick={() => setEditing(true)}
            className="w-full py-3.5 h-auto text-sm font-bold text-brand bg-brand/5 rounded-2xl hover:bg-brand/10 transition-colors"
          >
            Edit Today's Menu
          </button>
        </div>
      )}
    </div>
  );
}
