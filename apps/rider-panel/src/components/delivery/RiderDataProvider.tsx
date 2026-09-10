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
    const isDelivery = user?.role === 'delivery' || 
                       (user?.role as string) === 'delivery_agent' || 
                       (user as any)?.roles?.delivery === true || 
                       user?.role === 'admin' || 
                       user?.email?.toLowerCase().trim() === 'closeon.st@gmail.com' || 
                       (user as any)?.is_superadmin === true;

    if (!user?.id || !isDelivery) {
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

          // Guarantee assigned orders are loaded into agentOrders
          if (tripData.assignedOrderIds && tripData.assignedOrderIds.length > 0) {
            import('firebase/firestore').then(async ({ doc, getDoc }) => {
              const orderPromises = tripData.assignedOrderIds.map(oid => getDoc(doc(db, 'orders', oid)));
              const orderDocs = await Promise.all(orderPromises);
              const loadedOrders = orderDocs
                .filter(od => od.exists())
                .map(od => ({ id: od.id, ...od.data() } as DeliveryOrder));
              if (loadedOrders.length > 0) {
                setAgentOrders(loadedOrders);
              }
            }).catch(e => console.warn('Failed to load trip orders:', e));
          }
          
          // Enrich with Vendor phones for pickup stops
          const vendorIds = Array.from(new Set(tripData.pickupStops.map(s => s.vendorId))).filter(Boolean);
          
          if (vendorIds.length > 0) {
            import('@/lib/queries/users').then(async ({ fetchEnrichedProfiles }) => {
              const uMap = await fetchEnrichedProfiles(vendorIds, true);
              const enrichedPickups = tripData.pickupStops.map(s => {
                const u = uMap.get(s.vendorId);
                const freshLat = u?.location?.lat ?? u?.lat;
                const freshLng = u?.location?.lng ?? u?.lng;
                const freshAddress = u?.address || u?.location?.address;
                return {
                  ...s,
                  vendorPhone: u?.phone_number || u?.phone || '',
                  location: (typeof freshLat === 'number' && typeof freshLng === 'number') ? {
                    ...(s.location || {}),
                    lat: freshLat,
                    lng: freshLng,
                    address: freshAddress || s.location?.address || ''
                  } : s.location
                };
              });
              
              setActiveTrip({ ...tripData, pickupStops: enrichedPickups } as RiderTrip);
            }).catch(e => {
              console.warn('Failed to enrich vendor locations:', e);
              setActiveTrip(tripData);
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
  }, [user?.id, user?.role, (user as any)?.roles, setAgentOrders, setActiveTrip, setLastSynced]);

  return <>{children}</>;
}
