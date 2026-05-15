'use client';

import { create } from 'zustand';
import type { Vendor } from '@/types';

interface VendorState {
  vendors: Vendor[];
  lastFetched: number | null;
  setVendors: (vendors: Vendor[]) => void;
  invalidate: () => void;
  isStale: () => boolean;
}

const STALE_AFTER_MS = 5 * 60 * 1000; // 5 minutes

export const useVendorStore = create<VendorState>()((set, get) => ({
  vendors: [],
  lastFetched: null,
  setVendors: (vendors) => set({ vendors, lastFetched: Date.now() }),
  invalidate: () => set({ vendors: [], lastFetched: null }),
  isStale: () => {
    const { lastFetched } = get();
    if (!lastFetched) return true;
    return Date.now() - lastFetched > STALE_AFTER_MS;
  },
}));
