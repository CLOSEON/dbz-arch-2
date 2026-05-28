'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useDeliveryStore } from '@/store/deliveryStore';
import { subscribeToAgentDeliveries, updateDeliveryStatus } from '@/lib/queries/delivery';
import { AlertTriangle, Boxes, ChevronRight, Loader2, Map as MapIcon, MapPin, Navigation, Package } from 'lucide-react';
import toast from 'react-hot-toast';

export default function DriverPickupPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const agentOrders = useDeliveryStore((s) => s.agentOrders);
  const setAgentOrders = useDeliveryStore((s) => s.setAgentOrders);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    const unsubscribe = subscribeToAgentDeliveries(user.id, (orders) => {
      setAgentOrders(orders);
    });

    return () => unsubscribe();
  }, [setAgentOrders, user?.id]);

  const assignedOrders = agentOrders.filter(
    (order) => order.driverId === user?.id && (order.status === 'preparing' || order.status === 'picked_up')
  );

  const firstOrder = assignedOrders[0];
  const vendorName = firstOrder?.meal?.name ? 'Dabzo Kitchen Partner' : 'Partner Kitchen';
  const vendorAddress = firstOrder?.address?.line1 || '12, Street Lane, Landmark Zone';
  const vendorLat = firstOrder?.address?.lat ?? 28.6139;
  const vendorLng = firstOrder?.address?.lng ?? 77.209;
  const totalBoxes = assignedOrders.length;
  const totalStops = totalBoxes;
  const estimatedKm = totalBoxes > 0 ? (totalBoxes * 1.8 + 0.5).toFixed(1) : '0.0';

  const gmapsKey = process.env.NEXT_PUBLIC_GMAPS_KEY || '';
  const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${vendorLat},${vendorLng}&zoom=15&size=400x200&markers=${vendorLat},${vendorLng}&key=${gmapsKey}`;

  async function handleConfirmPickup() {
    if (assignedOrders.length === 0) {
      toast.error('No pending orders to pick up.');
      return;
    }

    if (!user?.id) {
      toast.error('Driver session not found. Please log in.');
      return;
    }

    setIsConfirming(true);
    setError(null);

    try {
      await Promise.all(assignedOrders.map((order) => updateDeliveryStatus(order.id, 'picked_up', user.id)));
      toast.success('Pickup confirmed! Live route started. 🚚');
      router.push('/driver/deliveries');
    } catch (err: any) {
      console.error('[DriverPickup] Error:', err);
      setError(err.message || 'Failed to update order status');
      toast.error('Failed to confirm pickup');
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <main className="animate-fade-in min-h-screen pb-28">
      <div className="border-b border-slate-100 bg-gradient-to-b from-brand/10 to-slate-50 px-4 pb-5 pt-6">
        <div className="mx-auto max-w-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand">Logistics handover</p>
              <h1 className="mt-2 text-[28px] font-black tracking-tight text-slate-900">Kitchen pickup</h1>
              <p className="mt-1 text-sm text-slate-500">Confirm your pickup and open the route in one tap.</p>
            </div>
            <div className="rounded-[1.2rem] bg-white p-3 shadow-sm">
              <Package className="h-6 w-6 text-brand" />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-md space-y-4 px-4 pt-4">
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          <span className="shrink-0 rounded-full bg-brand/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-brand">Ready meals: {totalBoxes}</span>
          <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Stops: {totalStops}</span>
          <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">Est. {estimatedKm} km</span>
        </div>

        {error && (
          <div className="flex items-start gap-3 rounded-[1.4rem] border border-rose-100 bg-rose-50 p-4 text-rose-700">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-xs font-bold leading-relaxed">{error}</p>
          </div>
        )}

        <div className="card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Vendor partner</p>
              <h2 className="mt-2 text-base font-black text-slate-900">{vendorName}</h2>
            </div>
            <div className="rounded-[1.1rem] bg-amber-50 p-2 text-amber-600">
              <Boxes className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 text-sm text-slate-500">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="leading-relaxed">{vendorAddress}</span>
          </div>

          <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Meals to collect</p>
              <p className="mt-1 text-2xl font-black text-brand">{totalBoxes}</p>
            </div>
            <span className="rounded-full bg-brand/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-brand">Handover pending</span>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <MapIcon className="h-4 w-4 text-slate-400" />
              <span className="text-sm font-black text-slate-900">Routing view</span>
            </div>
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </div>

          <div className="p-3">
            {gmapsKey ? (
              <img src={mapUrl} alt="Vendor location map" className="h-44 w-full rounded-[1.2rem] object-cover" />
            ) : (
              <div className="flex h-44 flex-col items-center justify-center rounded-[1.2rem] bg-gradient-to-br from-slate-100 to-slate-200 px-4 text-center">
                <div className="rounded-[1.2rem] bg-white/85 p-3 shadow-sm">
                  <MapPin className="h-5 w-5 text-brand" />
                </div>
                <p className="mt-3 text-sm font-black text-slate-700">Map view offline</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Proceed to the vendor address: {vendorAddress}</p>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="card">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Route stops</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{totalStops}</p>
          </div>
          <div className="card">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Distance</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{estimatedKm} km</p>
          </div>
        </div>

        {assignedOrders.length === 0 ? (
          <div className="card p-6 text-center">
            <Boxes className="mx-auto h-10 w-10 text-amber-500" />
            <p className="mt-3 text-sm font-black text-slate-900">No orders currently in queue</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">Active assignments will show up here automatically once the kitchen marks meals ready.</p>
          </div>
        ) : (
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleConfirmPickup}
            disabled={isConfirming}
            className="btn-primary"
          >
            {isConfirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
            Confirm pickup & start route
          </motion.button>
        )}
      </div>
    </main>
  );
}
