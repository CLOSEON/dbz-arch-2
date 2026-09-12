'use client';

import { useNetworkStore } from '@/store/networkStore';
import { WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function NetworkBanner() {
  const isOnline = useNetworkStore((state) => state.isOnline);

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="bg-rose-500 text-white overflow-hidden"
        >
          <div className="px-4 py-2 flex items-center justify-center gap-2 text-xs font-bold shadow-inner">
            <WifiOff className="w-4 h-4" />
            <span>Working offline — changes will sync when connected</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
