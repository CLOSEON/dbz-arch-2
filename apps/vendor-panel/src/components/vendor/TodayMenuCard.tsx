'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { useVendorData } from './VendorDataProvider';
import { getDailyMenu, saveDailyMenu, getTodayStr } from '@/lib/queries/menu';
import { DailyMenu, MenuItem, DietaryCategory } from '@/types';
import { Utensils, Plus, Trash2, Calendar } from 'lucide-react';
import { VegIcon, NonVegIcon } from '@/components/shared/DietaryIcon';

export function TodayMenuCard() {
  const user = useAuthStore((s) => s.user);
  const { managedVendor } = useVendorData();
  const currentVendor = managedVendor || user;
  const addToast = useUiStore((s) => s.addToast);

  const hasVeg = !currentVendor?.dietary_categories || currentVendor.dietary_categories.includes('veg');
  const hasNonVeg = currentVendor?.dietary_categories?.includes('non_veg');
  const hasBoth = hasVeg && hasNonVeg;

  const [activeTab, setActiveTab] = useState<DietaryCategory>(hasVeg ? 'veg' : 'non_veg');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState<DailyMenu | null>(null);
  
  // Form states for Veg and Non-Veg
  const [vegItems, setVegItems] = useState<MenuItem[]>([{ name: '' }]);
  const [vegNote, setVegNote] = useState('');
  const [nonVegItems, setNonVegItems] = useState<MenuItem[]>([{ name: '' }]);
  const [nonVegNote, setNonVegNote] = useState('');
  const [saving, setSaving] = useState(false);

  const todayStr = getTodayStr();
  const displayDate = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  useEffect(() => {
    if (currentVendor?.id) {
      loadMenu();
    }
  }, [currentVendor?.id]);

  async function loadMenu() {
    if (!currentVendor?.id) return;
    setLoading(true);
    try {
      const data = await getDailyMenu(currentVendor.id, todayStr);
      setMenu(data);
      if (data) {
        const toMenuItems = (list?: (MenuItem | string)[]): MenuItem[] => 
          (list || []).map(i => typeof i === 'string' ? { name: i } : i);

        // Load Veg Items
        const vItems = toMenuItems(data.items_veg && data.items_veg.length > 0 ? data.items_veg : data.items || []);
        setVegItems(vItems.length > 0 ? vItems : [{ name: '' }]);
        setVegNote(data.note_veg || data.note || '');

        // Load Non-Veg Items
        const nvItems = toMenuItems(data.items_non_veg || []);
        setNonVegItems(nvItems.length > 0 ? nvItems : [{ name: '' }]);
        setNonVegNote(data.note_non_veg || '');
      } else {
        setVegItems([{ name: '' }]);
        setNonVegItems([{ name: '' }]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Item manipulation helpers based on active tab
  const currentItems = activeTab === 'veg' ? vegItems : nonVegItems;
  const currentNote = activeTab === 'veg' ? vegNote : nonVegNote;

  function addItem() {
    if (activeTab === 'veg') {
      setVegItems([...vegItems, { name: '' }]);
    } else {
      setNonVegItems([...nonVegItems, { name: '' }]);
    }
  }

  function removeItem(index: number) {
    if (activeTab === 'veg') {
      setVegItems(vegItems.filter((_, i) => i !== index));
    } else {
      setNonVegItems(nonVegItems.filter((_, i) => i !== index));
    }
  }

  function updateItem(index: number, name: string) {
    if (activeTab === 'veg') {
      const updated = [...vegItems];
      updated[index] = { ...updated[index], name };
      setVegItems(updated);
    } else {
      const updated = [...nonVegItems];
      updated[index] = { ...updated[index], name };
      setNonVegItems(updated);
    }
  }

  function updateNote(val: string) {
    if (activeTab === 'veg') {
      setVegNote(val);
    } else {
      setNonVegNote(val);
    }
  }

  async function handleSave() {
    if (!user) return;
    const cleanVeg = vegItems.filter(it => it.name.trim());
    const cleanNonVeg = nonVegItems.filter(it => it.name.trim());

    if (hasVeg && cleanVeg.length === 0 && !hasNonVeg) {
      addToast('Please add at least one vegetarian menu item', 'warning');
      return;
    }
    if (hasNonVeg && cleanNonVeg.length === 0 && !hasVeg) {
      addToast('Please add at least one non-vegetarian menu item', 'warning');
      return;
    }
    if (cleanVeg.length === 0 && cleanNonVeg.length === 0) {
      addToast('Please add at least one item to your daily menu', 'warning');
      return;
    }

    setSaving(true);
    try {
      await saveDailyMenu(currentVendor.id, todayStr, {
        items_veg: cleanVeg,
        items_non_veg: cleanNonVeg,
        note_veg: vegNote.trim(),
        note_non_veg: nonVegNote.trim(),
        // Legacy fallbacks
        items: cleanVeg.length > 0 ? cleanVeg : cleanNonVeg,
        note: (vegNote.trim() || nonVegNote.trim()),
      });
      addToast('Daily menu saved successfully', 'success');
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

  const displayVegItems = menu?.items_veg && menu.items_veg.length > 0 ? menu.items_veg : menu?.items || [];
  const displayNonVegItems = menu?.items_non_veg || [];
  const displayItems = activeTab === 'veg' ? displayVegItems : displayNonVegItems;
  const displayNote = activeTab === 'veg' ? (menu?.note_veg || menu?.note) : menu?.note_non_veg;

  return (
    <div className="card space-y-5">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
            <Utensils className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 leading-none">Today's Daily Menu</h3>
            <p className="text-xs font-medium text-slate-400 mt-1.5">Configure what you are cooking today</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            {displayDate}
          </span>
        </div>
      </div>

      {/* Dual Category Tab Switcher (if vendor supports both) */}
      {hasBoth && (
        <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100 rounded-2xl">
          <button
            type="button"
            onClick={() => setActiveTab('veg')}
            className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
              activeTab === 'veg'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <VegIcon size={16} /> Pure Veg Menu
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('non_veg')}
            className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
              activeTab === 'non_veg'
                ? 'bg-white text-rose-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <NonVegIcon size={16} /> Non-Veg Menu
          </button>
        </div>
      )}

      {editing || !menu ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-1">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
              {activeTab === 'veg' ? 'Vegetarian Items' : 'Non-Vegetarian Items'}
            </span>
            <span className="text-[10px] font-bold text-slate-400">
              {currentItems.filter(i => i.name.trim()).length} added
            </span>
          </div>

          <div className="space-y-2">
            {currentItems.map((item, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  className="input flex-1 py-3.5"
                  placeholder={activeTab === 'veg' ? "Item (e.g. Paneer Butter Masala, Roti, Rice)" : "Item (e.g. Chicken Curry, Roti, Rice)"}
                  value={item.name}
                  onChange={(e) => updateItem(idx, e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="w-12 h-12 flex items-center justify-center bg-rose-50 text-rose-500 rounded-2xl shrink-0 hover:bg-rose-100 transition-colors border border-rose-100/50"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addItem}
            className="text-xs font-bold text-brand flex items-center gap-2 px-1 hover:underline group"
          >
            <div className="w-5 h-5 rounded-lg bg-brand/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Plus className="w-3 h-3" />
            </div>
            Add another {activeTab === 'veg' ? 'veg' : 'non-veg'} item
          </button>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5 ml-1">
              Note to customers for {activeTab === 'veg' ? 'Veg' : 'Non-Veg'} (optional)
            </label>
            <textarea
              className="input w-full min-h-[90px] py-3.5 resize-none text-xs"
              placeholder="Special instructions, packaging notes or chef's message…"
              value={currentNote}
              onChange={(e) => updateNote(e.target.value)}
            />
          </div>

          <div className="flex gap-3 pt-2">
            {menu && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="flex-1 py-3.5 h-auto text-sm font-bold text-slate-500 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-[2] btn-primary py-4 h-auto text-sm shadow-xl shadow-brand/20"
            >
              {saving ? 'Saving Menu…' : 'Save Today\'s Menu'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className={`rounded-2xl p-4 border ${
            activeTab === 'veg' ? 'bg-emerald-50/30 border-emerald-100' : 'bg-rose-50/30 border-rose-100'
          }`}>
            <div className="flex items-center justify-between mb-3 border-b border-slate-200/50 pb-2">
              <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                {activeTab === 'veg' ? <VegIcon size={14} /> : <NonVegIcon size={14} />}
                {activeTab === 'veg' ? 'Vegetarian Menu' : 'Non-Vegetarian Menu'}
              </span>
              <span className="text-[10px] font-bold text-slate-400">
                {displayItems.length} items
              </span>
            </div>

            {displayItems.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">No items entered for this menu today.</p>
            ) : (
              <div className="space-y-2">
                {displayItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${activeTab === 'veg' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <span className="text-sm font-semibold text-slate-800">{typeof item === 'string' ? item : item.name}</span>
                  </div>
                ))}
              </div>
            )}

            {displayNote && (
              <div className="mt-3 pt-3 border-t border-slate-200/50">
                <p className="text-[12px] text-slate-500 italic leading-relaxed">
                  "{displayNote}"
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
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
