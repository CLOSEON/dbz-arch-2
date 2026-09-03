'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { 
  Package, Search, Clock, ShieldAlert, X,
  MapPin, Loader2, Store, Users, CheckCircle, Flame
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Batch, AppUser } from '@/types';

export default function AdminVendorOpsPage() {
  const { user, isHydrated } = useAuthStore();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [vendors, setVendors] = useState<Record<string, AppUser>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [slotFilter, setSlotFilter] = useState('all');

  useEffect(() => {
    if (!isHydrated || !user || user.role !== 'admin') return;

    // Load vendors once
    const loadVendors = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'vendor')));
        const vMap: Record<string, AppUser> = {};
        snap.docs.forEach(d => {
          vMap[d.id] = { id: d.id, ...d.data() } as AppUser;
        });
        setVendors(vMap);
      } catch (err) {
        console.error('Failed to load vendors', err);
      }
    };
    loadVendors();

    const todayStr = new Date().toISOString().split('T')[0];
    
    // Listen to today's active batches
    const q = query(
      collection(db, 'batches'),
      where('date', '==', todayStr)
    );

    const unsub = onSnapshot(q, (snap) => {
      const bList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Batch));
      // Sort by slot (8am, 11am, 8pm)
      const slotOrder = { '8am': 1, '11am': 2, '8pm': 3 };
      bList.sort((a, b) => (slotOrder[a.slot as keyof typeof slotOrder] || 99) - (slotOrder[b.slot as keyof typeof slotOrder] || 99));
      setBatches(bList);
    });

    return () => unsub();
  }, [isHydrated, user]);

  if (!isHydrated) return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>;

  const filteredBatches = batches.filter(b => {
    const v = vendors[b.vendor_id];
    const vName = (v?.kitchen_name || v?.name || '').toLowerCase();
    const vId = b.vendor_id.toLowerCase();
    const bId = b.id.toLowerCase();
    const searchMatches = !searchQuery || vName.includes(searchQuery.toLowerCase()) || vId.includes(searchQuery.toLowerCase()) || bId.includes(searchQuery.toLowerCase());
    const slotMatches = slotFilter === 'all' || b.slot === slotFilter;
    return searchMatches && slotMatches;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'pickup_in_progress': return 'bg-brand/10 text-brand border-brand/20';
      case 'ready': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'preparing': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'notified': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto pb-28 md:pb-8">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-brand bg-brand/10 px-3 py-1 rounded-full">
            Kitchen Operations
          </span>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-tight mt-2.5">
            Vendor Ops
          </h1>
          <p className="text-xs text-slate-500 font-bold mt-1 uppercase tracking-wider">Today's Live Batches</p>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search vendor or batch ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-xs border border-slate-200 rounded-2xl focus:outline-none focus:border-brand/40 bg-white text-slate-900 font-medium placeholder-slate-400 shadow-sm"
            />
          </div>
          <select
            value={slotFilter}
            onChange={(e) => setSlotFilter(e.target.value)}
            className="w-full md:w-auto py-2.5 px-4 text-xs border border-slate-200 rounded-2xl focus:outline-none focus:border-brand/40 bg-white text-slate-900 font-medium shadow-sm appearance-none cursor-pointer"
          >
            <option value="all">All Slots</option>
            <option value="8am">8:00 AM</option>
            <option value="11am">11:00 AM</option>
            <option value="8pm">8:00 PM</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBatches.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-400 bg-white border border-slate-100 rounded-[2rem]">
            <Flame className="w-12 h-12 mx-auto mb-3 text-slate-200" />
            <p className="text-sm font-bold text-slate-500">No active batches right now.</p>
            <p className="text-xs mt-1">Batches are formed automatically 4 hours before the slot.</p>
          </div>
        ) : (
          filteredBatches.map(batch => {
            const vendor = vendors[batch.vendor_id];
            return (
              <div key={batch.id} className="bg-white rounded-[2rem] p-5 shadow-sm border border-slate-100 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                        <Store className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-900 leading-tight">{vendor?.kitchen_name || vendor?.name || 'Unknown Vendor'}</h3>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{batch.slot}</p>
                      </div>
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border ${getStatusColor(batch.status)}`}>
                      {batch.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-50 rounded-2xl p-3 text-center border border-slate-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Tiffins</p>
                      <p className="text-lg font-black text-slate-900 mt-0.5">{batch.total_count}</p>
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-3 text-center border border-slate-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Prep Margin</p>
                      {/* Simple mock of performance/delay for now */}
                      <p className={`text-xs font-black mt-1.5 ${batch.status === 'notified' ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {batch.status === 'notified' ? 'Pending' : 'On Track'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[9px] text-slate-400 font-mono tracking-wider">{batch.id}</span>
                  <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-lg">
                    <CheckCircle className="w-3 h-3 text-emerald-500" />
                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">
                      {batch.order_ids.length} Linked
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
