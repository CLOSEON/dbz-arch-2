'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuthStore } from '@/store/authStore';
import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { DeliveryOrder, RiderTrip } from '@/types/delivery';
import { useDeliveryStore } from '@/store/deliveryStore';

export function RiderDataProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const setAgentOrders = useDeliveryStore(s => s.setAgentOrders);
  const setActiveTrip = useDeliveryStore(s => s.setActiveTrip);
  const setLastSynced = useDeliveryStore(s => s.setLastSynced);

  useEffect(() => {
    if (!user?.id || (user.role !== 'delivery' && (user.role as string) !== 'delivery_agent')) {
      return;
    }

    let unsubOrders: () => void;
    let unsubTrip: () => void;

    try {
      // 1. Live Orders (Assigned to this rider)
      const qOrders = query(
        collection(db, 'orders'),
        where('driverId', '==', user.id),
        where('status', 'in', ['pending', 'notified', 'preparing', 'rider_assigned', 'vendor_ready', 'picked_up', 'out_for_delivery'])
      );
      
      unsubOrders = onSnapshot(qOrders, 
        { includeMetadataChanges: true },
        (snap) => {
        setAgentOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as DeliveryOrder)));
        setLastSynced(snap.metadata.fromCache ? new Date() : null);
      }, (err) => console.error("Rider Orders listener error:", err));

      // 2. Active Trip
      const qTrip = query(
        collection(db, 'rider_trips'),
        where('riderId', '==', user.id),
        where('status', 'in', ['pickup_pending', 'picking_up', 'pickup_complete', 'dropping'])
      );

      unsubTrip = onSnapshot(qTrip, async (snap) => {
        if (!snap.empty) {
          const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as RiderTrip));
          docs.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
          const tripData = docs[0];
          
          // Enrich with Vendor phones for pickup stops
          const vendorIds = Array.from(new Set(tripData.pickupStops.map(s => s.vendorId)));
          const uMap = new Map<string, any>();
          
          if (vendorIds.length > 0) {
            import('firebase/firestore').then(async ({ getDocs, query: q, collection: c, where: w, documentId: did }) => {
              const vSnap = await getDocs(q(c(db, 'users'), w(did(), 'in', vendorIds)));
              vSnap.forEach(d => uMap.set(d.id, d.data()));
              
              const enrichedPickups = tripData.pickupStops.map(s => ({
                ...s,
                vendorPhone: uMap.get(s.vendorId)?.phone_number || uMap.get(s.vendorId)?.phone || ''
              }));
              
              setActiveTrip({ ...tripData, pickupStops: enrichedPickups } as RiderTrip);
            });
          } else {
            setActiveTrip(tripData);
          }
          
        } else {
          setActiveTrip(null);
        }
      }, (err) => console.error("Rider Trip listener error:", err));

    } catch (e) {
      console.error(e);
    }

    return () => {
      if (unsubOrders) unsubOrders();
      if (unsubTrip) unsubTrip();
    };
  }, [user?.id, user?.role, setAgentOrders, setActiveTrip, setLastSynced]);

  return <>{children}</>;
}
