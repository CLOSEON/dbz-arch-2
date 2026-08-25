import { create } from 'zustand';

interface NetworkState {
  isOnline: boolean;
  setOnline: (status: boolean) => void;
}

// Ensure SSR safety by defaulting to true
const initialStatus = typeof navigator !== 'undefined' ? navigator.onLine : true;

export const useNetworkStore = create<NetworkState>((set) => ({
  isOnline: initialStatus,
  setOnline: (status) => set({ isOnline: status }),
}));
