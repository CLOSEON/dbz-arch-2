'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface PlatformStats {
  mealsDelivered: number;
  activeSubscribers: number;
  totalUsers: number;
  verifiedKitchens: number;
  deliveryPartners: number;
}

export function TrustedBySection() {
  const [stats, setStats] = useState<PlatformStats>({
    mealsDelivered: 0,
    activeSubscribers: 1,
    totalUsers: 43,
    verifiedKitchens: 3,
    deliveryPartners: 3,
  });

  useEffect(() => {
    try {
      const unsub = onSnapshot(
        doc(db, 'platform_stats', 'overview'),
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            setStats({
              mealsDelivered: typeof data.mealsDelivered === 'number' ? data.mealsDelivered : Number(data.mealsDelivered) || 0,
              activeSubscribers: typeof data.activeSubscribers === 'number' ? data.activeSubscribers : Number(data.activeSubscribers) || 1,
              totalUsers: typeof data.totalUsers === 'number' ? data.totalUsers : Number(data.totalUsers) || 43,
              verifiedKitchens: typeof data.verifiedKitchens === 'number' ? data.verifiedKitchens : Number(data.verifiedKitchens) || 3,
              deliveryPartners: typeof data.deliveryPartners === 'number' ? data.deliveryPartners : Number(data.deliveryPartners) || 3,
            });
          }
        },
        (error) => {
          console.warn('[TrustedBySection] Real-time stats listener fallback:', error);
        }
      );

      return () => unsub();
    } catch (e) {
      console.warn('[TrustedBySection] Error initializing real-time listener:', e);
    }
  }, []);

  const displayStats = [
    { 
      label: 'Meals Delivered', 
      value: stats.mealsDelivered > 0 ? `${stats.mealsDelivered.toLocaleString('en-IN')}+` : '0' 
    },
    { 
      label: 'Active Subscribers', 
      value: `${stats.activeSubscribers}` 
    },
    { 
      label: 'Verified Kitchens', 
      value: `${stats.verifiedKitchens}` 
    },
    { 
      label: 'Delivery Partners', 
      value: `${stats.deliveryPartners}` 
    },
  ];

  return (
    <section className="py-16 bg-white border-y border-slate-100 relative z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-sm font-bold text-slate-400 uppercase tracking-widest mb-10">
          Trusted by the best in the city
        </p>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12 text-center">
          {displayStats.map((stat, i) => (
            <motion.div 
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
            >
              <div className="text-3xl lg:text-4xl font-black text-slate-900 mb-1">
                {stat.value}
              </div>
              <div className="text-sm font-semibold text-slate-500">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
