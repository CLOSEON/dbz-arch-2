'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuthStore } from '@/store/authStore';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { EnrichedSubscription, DailyMenu } from '@/types';
import { getTodayStr } from '@/lib/queries/menu';
import { fetchEnrichedProfiles } from '@/lib/queries/users';

interface VendorDataContextType {
  batches: any[];
  pickups: any[];
  deliveries: any[];
  subscriptions: EnrichedSubscription[];
  dailyMenu: DailyMenu | null;
  loading: boolean;
  error: Error | null;
}

const VendorDataContext = createContext<VendorDataContextType | undefined>(undefined);

export function VendorDataProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  
  const [batches, setBatches] = useState<any[]>([]);
  const [pickups, setPickups] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<EnrichedSubscription[]>([]);
  const [dailyMenu, setDailyMenu] = useState<DailyMenu | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user?.id || user.role !== 'vendor') {
      setLoading(false);
      return;
    }

    setLoading(true);
    let unsubBatches: () => void;
    let unsubPickups: () => void;
    let unsubDeliveries: () => void;
    let unsubSubscriptions: () => void;
    let unsubMenu: () => void;

    try {
      // 1. Batches
      const qBatches = query(
        collection(db, 'batches'),
        where('vendor_id', '==', user.id),
        where('status', 'in', ['pending', 'preparing', 'ready', 'notified'])
      );
      unsubBatches = onSnapshot(qBatches, (snap) => {
        setBatches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (err) => {
        console.error("Batches listener error:", err);
        setError(err);
      });

      // 2. Incoming Pickups (Rider Trips)
      const qPickups = query(
        collection(db, 'rider_trips'),
        where('vendorIds', 'array-contains', user.id),
        where('status', 'in', ['assigned', 'accepted', 'at_vendor', 'pickup_pending', 'picking_up'])
      );
      unsubPickups = onSnapshot(qPickups, async (snap) => {
        const rawTrips = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        const riderIds = Array.from(new Set(rawTrips.map(t => t.riderId))).filter(Boolean);
        
        const riderMap = await fetchEnrichedProfiles(riderIds);

        const enriched = rawTrips.map(trip => {
          const r = riderMap.get(trip.riderId);
          return { ...trip, riderName: r?.name || 'Rider', riderPhone: r?.phone_number || r?.phone || '' };
        });
        setPickups(enriched);
      }, (err) => console.error("Pickups listener error:", err));

      // 3. Live Deliveries
      const qDel = query(
        collection(db, 'deliveries'),
        where('vendor_id', '==', user.id),
        where('status', 'in', ['out_for_delivery', 'picked_up'])
      );
      unsubDeliveries = onSnapshot(qDel, (snap) => {
        setDeliveries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (err) => console.error("Deliveries listener error:", err));

      // 4. Subscriptions (with user enrichment)
      const qSubs = query(
        collection(db, 'subscriptions'),
        where('vendor_id', '==', user.id),
        where('status', '==', 'active')
      );
      unsubSubscriptions = onSnapshot(qSubs, async (snap) => {
        const rawSubs = snap.docs.map(d => ({ id: d.id, ...d.data() } as EnrichedSubscription));
        const userIds = Array.from(new Set(rawSubs.map(s => s.user_id))).filter(Boolean);
        
        const userMap = await fetchEnrichedProfiles(userIds);
        
        const enriched = rawSubs.map(sub => {
          const u = userMap.get(sub.user_id);
          return { ...sub, userName: u?.name || 'Unknown', userPhone: u?.phone || '' };
        });
        setSubscriptions(enriched);
      }, (err) => console.error("Subscriptions listener error:", err));

      // 5. Daily Menu
      const todayStr = getTodayStr();
      const qMenu = query(
        collection(db, 'daily_menus'),
        where('vendor_id', '==', user.id),
        where('date', '==', todayStr)
      );
      unsubMenu = onSnapshot(qMenu, (snap) => {
        if (!snap.empty) {
          setDailyMenu({ id: snap.docs[0].id, ...snap.docs[0].data() } as DailyMenu);
        } else {
          setDailyMenu(null);
        }
      }, (err) => console.error("Menu listener error:", err));

      setLoading(false);
    } catch (e: any) {
      setError(e);
      setLoading(false);
    }

    return () => {
      if (unsubBatches) unsubBatches();
      if (unsubPickups) unsubPickups();
      if (unsubDeliveries) unsubDeliveries();
      if (unsubSubscriptions) unsubSubscriptions();
      if (unsubMenu) unsubMenu();
    };
  }, [user?.id, user?.role]);

  return (
    <VendorDataContext.Provider value={{ batches, pickups, deliveries, subscriptions, dailyMenu, loading, error }}>
      {children}
    </VendorDataContext.Provider>
  );
}

export function useVendorData() {
  const context = useContext(VendorDataContext);
  if (context === undefined) {
    throw new Error('useVendorData must be used within a VendorDataProvider');
  }
  return context;
}
