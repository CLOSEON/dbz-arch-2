'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useDeliveryStore } from '@/store/deliveryStore';
import { useAuthStore } from '@/store/authStore';
import { updateDeliveryStatus, subscribeToAgentDeliveries } from '@/lib/queries/delivery';
import { 
  MapPin, 
  Package, 
  Navigation, 
  AlertTriangle, 
  Loader2, 
  Map as MapIcon,
  ChevronRight,
  TrendingUp,
  Boxes
} from 'lucide-react';
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
  }, [user?.id, setAgentOrders]);

  // Read assigned orders from the Zustand delivery store
  // Filters orders that are currently in the 'preparing' or 'picked_up' state
  const assignedOrders = agentOrders.filter(
    (order) => order.driverId === user?.id && (order.status === 'preparing' || order.status === 'picked_up')
  );

  // Extract the vendor info from the first assigned order if available
  const firstOrder = assignedOrders[0];
  const vendorName = firstOrder?.meal.name ? "Dabzo Kitchen Partner" : "Partner Kitchen";
  const vendorAddress = firstOrder?.address.line1 || "12, Street Lane, Landmark Zone";
  const vendorLat = firstOrder?.address.lat ?? 28.6139;
  const vendorLng = firstOrder?.address.lng ?? 77.2090;

  // Total boxes to collect (one box per order)
  const totalBoxes = assignedOrders.length;

  // Calculated route statistics
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
      // Transition all assigned orders to the "picked_up" state
      await Promise.all(
        assignedOrders.map((order) => 
          updateDeliveryStatus(order.id, 'picked_up', user.id)
        )
      );

      toast.success('Pickup confirmed! Live route started. 🚚');
      // Navigate to driver's deliveries list
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
    <main className="min-h-screen bg-slate-50 pb-24 animate-fade-in">
      {/* Visual Header Banner */}
      <div className="bg-gradient-to-b from-brand/10 to-slate-50 pt-8 pb-4 px-6 border-b border-slate-100 flex items-center justify-between">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-brand bg-brand/10 px-3 py-1 rounded-full">
            Logistics Handover
          </span>
          <h1 className="text-[28px] font-black text-slate-900 tracking-tight leading-tight mt-2">
            Kitchen Pickup
          </h1>
        </div>
        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-700 shadow-sm border border-slate-100 shrink-0">
          <Package className="w-6 h-6 text-brand" />
        </div>
      </div>

      <div className="px-6 space-y-6 max-w-md mx-auto mt-4">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-brand/10 text-brand">
            Ready Meals: {totalBoxes}
          </span>
          <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-blue-50 text-blue-600">
            Stops: {totalStops}
          </span>
          <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-600">
            Est. {estimatedKm} km
          </span>
        </div>
        {/* Error Callout */}
        {error && (
          <div className="bg-rose-50 border border-rose-100 rounded-3xl p-4 flex items-start gap-3 text-rose-700 text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="font-semibold text-xs leading-snug">{error}</p>
          </div>
        )}

        {/* Vendor Information Card */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Vendor Partner
              </span>
              <h3 className="text-base font-black text-slate-900 mt-0.5 leading-tight">
                {vendorName}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500">
              <Boxes className="w-5 h-5" />
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <MapPin className="w-4 h-4 text-slate-300 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              {vendorAddress}
            </p>
          </div>

          <div className="border-t border-slate-50 pt-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Boxes to Collect
              </p>
              <p className="text-xl font-black text-brand mt-0.5 leading-none">
                {totalBoxes} Meals
              </p>
            </div>
            <span className="text-[10px] font-black bg-brand/10 text-brand px-3 py-1.5 rounded-full uppercase tracking-wider">
              Handover Pending
            </span>
          </div>
        </div>

        {/* Static Map Thumbnail Fallback */}
        <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-100">
          <div className="p-4 border-b border-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapIcon className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-bold text-slate-900">Map Routing View</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          
          <div className="w-full h-44 bg-slate-100 relative flex items-center justify-center">
            {gmapsKey ? (
              <img
                src={mapUrl}
                alt="Vendor Location Map"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-slate-200 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-12 h-12 bg-white/80 rounded-2xl flex items-center justify-center shadow-md mb-2">
                  <MapPin className="w-5 h-5 text-brand" />
                </div>
                <p className="text-xs font-bold text-slate-600">Map View Offline</p>
                <p className="text-[9px] text-slate-400 mt-0.5 font-medium leading-tight">
                  Proceed to vendor address: {vendorAddress}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Route Stats Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Route Stops</p>
            <h4 className="text-2xl font-black text-slate-900 mt-1 leading-none">{totalStops} Stops</h4>
          </div>
          <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estimated Dist</p>
            <h4 className="text-2xl font-black text-slate-900 mt-1 leading-none flex items-center gap-1">
              {estimatedKm} <span className="text-xs font-bold text-slate-400">km</span>
            </h4>
          </div>
        </div>

        {/* Action Button */}
        {assignedOrders.length === 0 ? (
          <div className="bg-amber-50 border border-amber-100 rounded-3xl p-6 text-center flex flex-col items-center">
            <Boxes className="w-10 h-10 text-amber-500 mb-2" />
            <p className="text-xs font-bold text-amber-900">No Orders Currently in Queue</p>
            <p className="text-[10px] text-amber-600/80 font-medium mt-1">
              Active assignments will show up automatically here once prepared by the kitchen.
            </p>
          </div>
        ) : (
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleConfirmPickup}
            disabled={isConfirming}
            className="w-full bg-brand text-white rounded-2xl py-4.5 text-xs font-black uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-brand/20 disabled:opacity-50 sticky bottom-4"
          >
            {isConfirming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <ChevronRight className="w-4 h-4" />
                Confirm Pickup & Start Route
              </>
            )}
          </motion.button>
        )}
      </div>
    </main>
  );
}
