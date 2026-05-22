'use client';

import { create } from 'zustand';
import type { DeliveryOrder, DriverProfile } from '@/types/delivery';

interface DeliveryState {
  /** The current active delivery order for the customer role */
  myDelivery: DeliveryOrder | null;
  /** Active list of delivery orders assigned to a vendor kitchen */
  vendorOrders: DeliveryOrder[];
  /** Active list of delivery orders assigned to the delivery agent */
  agentOrders: DeliveryOrder[];
  /** Active online delivery drivers in the logistics fleet for tracking */
  activeDrivers: DriverProfile[];
  /** Administrator statistical overview of delivery states */
  adminOverview: {
    preparing: number;
    picked_up: number;
    out_for_delivery: number;
    delivered: number;
  };
  /** Operational loading state representing background network/sync processes */
  isLoading: boolean;
  /** Background operational error messages if any */
  error: string | null;
  /** Timestamp of the last successful sync (used to indicate offline cache status) */
  lastSynced: Date | null;

  /** Sets the customer's active tracking delivery order */
  setMyDelivery: (order: DeliveryOrder | null) => void;
  /** Sets the list of orders assigned to a vendor kitchen */
  setVendorOrders: (orders: DeliveryOrder[]) => void;
  /** Sets the list of orders assigned to the delivery agent */
  setAgentOrders: (orders: DeliveryOrder[]) => void;
  /** Sets the list of online active drivers for layout map plots */
  setActiveDrivers: (drivers: DriverProfile[]) => void;
  /** Sets the dashboard metrics statistics object for the admin panel */
  setAdminOverview: (overview: {
    preparing: number;
    picked_up: number;
    out_for_delivery: number;
    delivered: number;
  }) => void;
  /** Updates the transaction loading state */
  setLoading: (isLoading: boolean) => void;
  /** Updates the log error state */
  setError: (error: string | null) => void;
  /** Updates the last synced timestamp */
  setLastSynced: (date: Date | null) => void;
  /** Resets the entire delivery store to its default/uninitialized configuration */
  clearDelivery: () => void;
}

export const useDeliveryStore = create<DeliveryState>((set) => ({
  myDelivery: null,
  vendorOrders: [],
  agentOrders: [],
  activeDrivers: [],
  adminOverview: {
    preparing: 0,
    picked_up: 0,
    out_for_delivery: 0,
    delivered: 0,
  },
  isLoading: false,
  error: null,
  lastSynced: null,

  setMyDelivery: (order) => set({ myDelivery: order }),
  setVendorOrders: (orders) => set({ vendorOrders: orders }),
  setAgentOrders: (orders) => set({ agentOrders: orders }),
  setActiveDrivers: (drivers) => set({ activeDrivers: drivers }),
  setAdminOverview: (overview) => set({ adminOverview: overview }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setLastSynced: (date) => set({ lastSynced: date }),
  clearDelivery: () =>
    set({
      myDelivery: null,
      vendorOrders: [],
      agentOrders: [],
      activeDrivers: [],
      adminOverview: {
        preparing: 0,
        picked_up: 0,
        out_for_delivery: 0,
        delivered: 0,
      },
      isLoading: false,
      error: null,
      lastSynced: null,
    }),
}));
