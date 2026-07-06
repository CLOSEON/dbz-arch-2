'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, limit, orderBy } from 'firebase/firestore';
import { 
  Package, Search, Clock, ArrowRightLeft, ShieldAlert, X,
  MapPin, Loader2, User, UserCheck, Calendar, Activity, CheckCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Order, OrderStatusLog, Batch } from '@/types';
import type { RiderTrip } from '@/types/delivery';

export default function AdminOrdersTrackingPage() {
  const { user, isHydrated } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  
  // Results
  const [order, setOrder] = useState<Order | null>(null);
  const [statusLogs, setStatusLogs] = useState<OrderStatusLog[]>([]);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [riderTrip, setRiderTrip] = useState<RiderTrip | null>(null);
  const [relatedRecords, setRelatedRecords] = useState<any[]>([]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    const toastId = toast.loading('Searching order...');
    
    try {
      // 1. Fetch Order
      const orderRef = doc(db, 'orders', searchQuery.trim());
      const orderSnap = await getDoc(orderRef);
      
      if (!orderSnap.exists()) {
        toast.error('Order not found', { id: toastId });
        setOrder(null);
        return;
      }
      
      const orderData = orderSnap.data() as Order;
      setOrder(orderData);
      toast.success('Order found', { id: toastId });

      // 2. Fetch Status Logs
      const logsQ = query(
        collection(db, 'order_status_logs'),
        where('order_id', '==', orderData.id)
      );
      const logsSnap = await getDocs(logsQ);
      setStatusLogs(logsSnap.docs.map(d => d.data() as OrderStatusLog).sort((a, b) => {
        const tA = (a.timestamp as any)?.seconds || 0;
        const tB = (b.timestamp as any)?.seconds || 0;
        return tB - tA;
      }));

      // 3. Fetch Batch
      if (orderData.batch_id) {
        const batchSnap = await getDoc(doc(db, 'batches', orderData.batch_id));
        if (batchSnap.exists()) {
          setBatch(batchSnap.data() as Batch);
        }
      } else {
        setBatch(null);
      }

      // 4. Fetch Rider Trip
      if (orderData.rider_trip_id) {
        const tripSnap = await getDoc(doc(db, 'rider_trips', orderData.rider_trip_id));
        if (tripSnap.exists()) {
          setRiderTrip(tripSnap.data() as RiderTrip);
        }
      } else {
        setRiderTrip(null);
      }

      // 5. Fetch Related Records (Swaps, Skips)
      const related: any[] = [];
      
      const swapsQ = query(collection(db, 'swap_requests'), where('order_id', '==', orderData.id));
      const swapsSnap = await getDocs(swapsQ);
      swapsSnap.forEach(d => related.push({ type: 'Swap Request', id: d.id, ...d.data() }));

      const skipsQ = query(collection(db, 'skip_requests'), where('order_id', '==', orderData.id));
      const skipsSnap = await getDocs(skipsQ);
      skipsSnap.forEach(d => related.push({ type: 'Skip Record', id: d.id, ...d.data() }));

      // Also fetch credits where source_reference_id = order_id
      const creditsQ = query(collection(db, 'user_credits'), where('source_reference_id', '==', orderData.id));
      const creditsSnap = await getDocs(creditsQ);
      creditsSnap.forEach(d => related.push({ type: 'Credit Record', id: d.id, ...d.data() }));

      setRelatedRecords(related);

    } catch (err: any) {
      toast.error('Search failed: ' + err.message, { id: toastId });
    } finally {
      setIsSearching(false);
    }
  };

  if (!isHydrated) return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto pb-28 md:pb-8">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-brand bg-brand/10 px-3 py-1 rounded-full">
            Support Tools
          </span>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-tight mt-2.5">
            Order Lookup
          </h1>
        </div>
        <form onSubmit={handleSearch} className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search exact order ID (e.g. ORD-2026-...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-xs border border-slate-200 rounded-2xl focus:outline-none focus:border-brand/40 bg-white text-slate-900 font-medium placeholder-slate-400 shadow-sm"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching || !searchQuery.trim()}
            className="w-full md:w-auto py-2.5 px-6 bg-brand text-white rounded-2xl text-xs font-black hover:bg-brand/90 transition-colors disabled:opacity-50"
          >
            Search
          </button>
        </form>
      </div>

      {!order && !isSearching && (
        <div className="bg-slate-50 border border-slate-100 rounded-3xl p-12 text-center text-slate-400">
          <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-sm font-bold text-slate-500">Enter a specific order ID to view its full lifecycle</p>
        </div>
      )}

      {order && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Order Details */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 space-y-6">
              <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Package className="w-5 h-5 text-brand" />
                    <h2 className="text-xl font-black text-slate-900">{order.id}</h2>
                  </div>
                  <p className="text-xs text-slate-500 font-medium flex items-center gap-2">
                    <Calendar className="w-3 h-3" /> {order.date} • {order.delivery_slot} • {order.meal_type}
                  </p>
                </div>
                <span className="px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider bg-slate-100 text-slate-800">
                  {order.status.replace(/_/g, ' ')}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Customer ID</p>
                  <p className="text-sm font-bold text-slate-900">{order.user_id}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vendor ID</p>
                  <p className="text-sm font-bold text-slate-900">{order.vendor_id || 'Not Assigned'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Delivery Address</p>
                  <p className="mt-1.5 text-xs font-medium text-slate-600 line-clamp-2">{order.delivery_address}</p>
                </div>
              </div>
            </div>

            {/* Related Records */}
            {relatedRecords.length > 0 && (
              <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 space-y-4">
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-brand" /> Associated Records
                </h3>
                <div className="space-y-3">
                  {relatedRecords.map((r, i) => (
                    <div key={i} className="p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{r.type}</span>
                        <span className="text-[10px] font-bold text-slate-400">{r.id}</span>
                      </div>
                      <pre className="text-[9px] text-slate-600 overflow-x-auto whitespace-pre-wrap font-mono">
                        {JSON.stringify(r, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Batch & Rider Info */}
            <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 space-y-4">
              <h3 className="text-sm font-black text-slate-900">Logistics</h3>
              <div className="space-y-4">
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-1">Batch Assignment</p>
                  {batch ? (
                    <>
                      <p className="text-xs font-bold text-amber-900 break-all">{batch.id}</p>
                      <p className="text-[10px] text-amber-800 mt-1">Status: {batch.status}</p>
                    </>
                  ) : (
                    <p className="text-xs font-bold text-amber-900/50">Pending Formation</p>
                  )}
                </div>
                
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 mb-1">Rider Trip</p>
                  {riderTrip ? (
                    <>
                      <p className="text-xs font-bold text-emerald-900 break-all">{riderTrip.id}</p>
                      <p className="text-[10px] text-emerald-800 mt-1">Rider: {riderTrip.riderId} • Status: {riderTrip.status}</p>
                    </>
                  ) : (
                    <p className="text-xs font-bold text-emerald-900/50">Pending Assignment</p>
                  )}
                </div>
              </div>
            </div>

            {/* Lifecycle Logs */}
            <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 space-y-4 max-h-[500px] overflow-y-auto">
              <h3 className="text-sm font-black text-slate-900">Lifecycle Audit</h3>
              {statusLogs.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No logs found.</p>
              ) : (
                <div className="space-y-4 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                  {statusLogs.map((log, i) => (
                    <div key={log.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-5 h-5 rounded-full border-2 border-white bg-slate-200 text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2"></div>
                      <div className="w-[calc(100%-2.5rem)] md:w-[calc(50%-1.25rem)] p-3 rounded-2xl bg-slate-50 border border-slate-100 shadow-sm">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-black uppercase tracking-wider text-brand">{log.to_status.replace(/_/g, ' ')}</span>
                          <span className="text-[9px] text-slate-400 font-bold">{log.timestamp ? new Date((log.timestamp as any).seconds * 1000).toLocaleTimeString() : 'N/A'}</span>
                        </div>
                          {log.from_status && <p className="text-[10px] text-slate-500">From: {log.from_status.replace(/_/g, ' ')}</p>}
                        <p className="text-[9px] text-slate-400 mt-1 uppercase">By: {log.actor}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
