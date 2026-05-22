'use client';
import { useState, useEffect } from 'react';
import { Users, CheckCircle, Navigation } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { MealRatesCard } from '@/components/vendor/MealRatesCard';
import { TodayMenuCard } from '@/components/vendor/TodayMenuCard';
import { VendorProfileCard } from '@/components/vendor/VendorProfileCard';
import { VendorReviews } from '@/components/vendor/VendorReviews';
import { getVendorDeliveries } from '@/lib/queries/delivery';
import { getActiveDeliveryPartners } from '@/lib/queries/admin';
import dynamic from 'next/dynamic';

const DeliveryMap = dynamic(() => import('@/components/delivery/DeliveryMap'), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-64 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-center animate-pulse">
      <Navigation className="w-8 h-8 text-slate-300" />
    </div>
  )
});

export default function VendorDashboard() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [activeDeliveries, setActiveDeliveries] = useState<any[]>([]);
  const [fleetLocations, setFleetLocations] = useState<any[]>([]);

  // Computed state for the map
  const partnerLocations = fleetLocations.filter(p => 
    activeDeliveries.some(d => d.assigned_to === p.id && d.status === 'picked_up')
  );

  useEffect(() => {
    let unsubscribeDeliveries: (() => void) | undefined;
    let unsubscribeFleet: (() => void) | undefined;

    if (user?.id) {
      import('firebase/firestore').then(({ collection, query, where, onSnapshot }) => {
        import('@/lib/firebase').then(({ db }) => {
          
          // 1. Listen to vendor's deliveries
          const qDel = query(collection(db, 'deliveries'), where('vendor_id', '==', user.id));
          unsubscribeDeliveries = onSnapshot(qDel, (snap) => {
            setActiveDeliveries(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
          });

          // 2. Listen to all fleet locations
          const qFleet = query(collection(db, 'users'), where('role', '==', 'delivery'));
          unsubscribeFleet = onSnapshot(qFleet, (snap) => {
            const fleet = snap.docs
              .map(d => ({ id: d.id, ...d.data() } as any))
              .filter(u => u.location && u.location.lat && u.location.lng);
            setFleetLocations(fleet);
          });
        });
      });
    }

    return () => {
      if (unsubscribeDeliveries) unsubscribeDeliveries();
      if (unsubscribeFleet) unsubscribeFleet();
    };
  }, [user?.id]);

  if (user?.role === 'vendor' && !user.is_approved) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center animate-fade-in">
        <div className="w-24 h-24 bg-amber-50 rounded-[2.5rem] flex items-center justify-center mb-6 text-4xl shadow-xl shadow-amber-100">
          ⏳
        </div>
        <h1 className="text-2xl font-black text-slate-900 mb-2">Registration Pending</h1>
        <p className="text-slate-500 max-w-xs mb-8 font-medium">
          Your kitchen profile is under review. Our team will verify your details and approve you within 24 hours.
        </p>
        <button
          onClick={logout}
          className="btn-outline w-auto px-8"
        >
          Logout & Wait
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex items-start justify-between mt-4 px-1">
        <div>
          <h1 className="text-[36px] font-black text-slate-900 tracking-tight leading-tight">
            Dashboard
          </h1>
          <p className="text-sm font-medium text-slate-400 mt-1">
            Manage your kitchen & daily operations
          </p>
        </div>
        <button
          onClick={logout}
          className="btn-outline"
        >
          Logout
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:gap-6">
        <div className="card">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Subscribers</p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl font-black text-slate-900 leading-none">{user?.subscriberCount || 0}</h3>
            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
              <Users className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="card">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Status</p>
          <div className="flex items-end justify-between">
            <h3 className="text-lg font-black text-emerald-500 leading-none flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse" />
              Active
            </h3>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500">
              <CheckCircle className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Fleet Tracking Map */}
      <div className="bg-white rounded-3xl p-5 md:p-8 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <Navigation className="w-5 h-5 text-emerald-500" />
            Active Deliveries
          </h3>
          <span className="text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1 rounded-full">
            {partnerLocations.length} on route
          </span>
        </div>
        <DeliveryMap 
          markers={partnerLocations.map(p => ({
            id: p.id,
            lat: p.location.lat,
            lng: p.location.lng,
            title: p.name || 'Delivery Partner',
            subtitle: p.phone
          }))} 
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <div className="space-y-6">
          <TodayMenuCard />
          <MealRatesCard />
        </div>
        <div className="space-y-6">
          <VendorProfileCard />
          {user?.id && <VendorReviews vendorId={user.id} />}
        </div>
      </div>
    </div>
  );
}
