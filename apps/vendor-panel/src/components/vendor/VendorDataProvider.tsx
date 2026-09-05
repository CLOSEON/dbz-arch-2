'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuthStore } from '@/store/authStore';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
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
  activeVendorId: string | null;
  setActiveVendorId: (id: string) => void;
  allVendors: any[];
  managedVendor: any | null;
}

const VendorDataContext = createContext<VendorDataContextType | undefined>(undefined);

export function VendorDataProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  
  const [batches, setBatches] = useState<any[]>([]);
  const [pickups, setPickups] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<EnrichedSubscription[]>([]);
  const [dailyMenu, setDailyMenu] = useState<DailyMenu | null>(null);
  
  const [allVendors, setAllVendors] = useState<any[]>([]);
  const [activeVendorId, setActiveVendorIdState] = useState<string | null>(null);
  const [managedVendor, setManagedVendor] = useState<any | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // 1. Fetch available vendors for superadmin
  useEffect(() => {
    if (!user?.id || user.role !== 'vendor') {
    if (!user?.id) return;

    if (user.is_superadmin) {
      const qVendors = query(collection(db, 'users'), where('role', 'in', ['vendor', 'kitchen']));
      getDocs(qVendors).then((snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAllVendors(list);

        const savedId = typeof window !== 'undefined' ? localStorage.getItem('dabzzo_active_vendor_id') : null;
        if (savedId && list.some(v => v.id === savedId)) {
          setActiveVendorIdState(savedId);
        } else {
          // Default to Priya's Kitchen if available, otherwise first verified vendor, otherwise user.id
          const priya = list.find(v => v.id === 'kb4yMdXRFBR2AhZWnY2GloUbHxR2');
          const defaultVendor = priya || list[0];
          const chosenId = defaultVendor ? defaultVendor.id : user.id;
          setActiveVendorIdState(chosenId);
        }
      }).catch(err => {
        console.warn('Failed to fetch all vendors:', err);
        setActiveVendorIdState(user.id);
      });
    } else {
      setActiveVendorIdState(user.id);
      setManagedVendor(user);
    }
  }, [user?.id, user?.is_superadmin]);

  const setActiveVendorId = (id: string) => {
    setActiveVendorIdState(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem('dabzzo_active_vendor_id', id);
    }
  };

  const targetVendorId = activeVendorId || user?.id;

  // Sync managedVendor profile
  useEffect(() => {
    if (!targetVendorId) return;
    if (targetVendorId === user?.id && !user?.is_superadmin) {
      setManagedVendor(user);
    } else {
      const found = allVendors.find(v => v.id === targetVendorId);
      if (found) {
        setManagedVendor(found);
      } else {
        const unsub = onSnapshot(collection(db, 'users'), (snap) => {
          const docMatch = snap.docs.find(d => d.id === targetVendorId);
          if (docMatch) setManagedVendor({ id: docMatch.id, ...docMatch.data() });
        });
        return () => unsub();
      }
    }
  }, [targetVendorId, allVendors, user]);

  useEffect(() => {
    if (!targetVendorId) {
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
        where('vendor_id', '==', targetVendorId),
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
        where('vendorIds', 'array-contains', targetVendorId),
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
        where('vendor_id', '==', targetVendorId),
        where('status', 'in', ['out_for_delivery', 'picked_up'])
      );
      unsubDeliveries = onSnapshot(qDel, (snap) => {
        setDeliveries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (err) => console.error("Deliveries listener error:", err));

      // 4. Subscriptions (with user enrichment)
      const qSubs = query(
        collection(db, 'subscriptions'),
        where('vendor_id', '==', user.id),
        where('vendor_id', '==', targetVendorId),
        where('status', '==', 'active')
      );
      unsubSubscriptions = onSnapshot(qSubs, async (snap) => {
        const rawSubs = snap.docs.map(d => ({ id: d.id, ...d.data() } as EnrichedSubscription));
        const userIds = Array.from(new Set(rawSubs.map(s => s.user_id))).filter(Boolean);
        
        const userMap = await fetchEnrichedProfiles(userIds);
        
        const enriched = rawSubs.map(sub => {
          const u = userMap.get(sub.user_id);
          return { ...sub, userName: u?.name || 'Unknown', userPhone: u?.phone || '' };
          return { ...sub, userName: u?.name || 'Customer', userPhone: u?.phone || '' };
        });
        setSubscriptions(enriched);
      }, (err) => console.error("Subscriptions listener error:", err));

      // 5. Daily Menu
      const todayStr = getTodayStr();
      const qMenu = query(
        collection(db, 'daily_menus'),
        where('vendor_id', '==', user.id),
        where('vendor_id', '==', targetVendorId),
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
  }, [targetVendorId]);

  return (
    <VendorDataContext.Provider value={{ batches, pickups, deliveries, subscriptions, dailyMenu, loading, error }}>
    <VendorDataContext.Provider value={{ 
      batches, 
      pickups, 
      deliveries, 
      subscriptions, 
      dailyMenu, 
      loading, 
      error,
      activeVendorId,
      setActiveVendorId,
      allVendors,
      managedVendor
    }}>
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
