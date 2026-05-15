'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { getAssignedDeliveries, updateDeliveryStatus } from '@/lib/queries/delivery';
import { Delivery, DeliveryStatus } from '@/types';
import { Truck, Navigation, Clock, CheckCircle2, Loader2, Camera } from 'lucide-react';
import Image from 'next/image';
import { uploadImage, cloudinaryUrl } from '@/lib/cloudinary';
import { updateUser } from '@/lib/queries/users';
import { useRef } from 'react';

export default function DeliveryDashboard() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const addToast = useUiStore((s) => s.addToast);
  
  const [activeDeliveries, setActiveDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setLoadingImage(true);
    try {
      const url = await uploadImage(file);
      if (url) {
        await updateUser(user.id, { image: url });
        setUser({ ...user, image: url });
        addToast('Profile image updated! 📸', 'success');
      }
    } catch (err) {
      addToast('Image upload failed', 'error');
    } finally {
      setLoadingImage(false);
    }
  }

  useEffect(() => {
    if (user?.id) loadDeliveries();
  }, [user?.id]);

  async function loadDeliveries() {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getAssignedDeliveries(user.id);
      setActiveDeliveries(data);
    } catch (err) {
      addToast('Failed to load assignments', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusUpdate(deliveryId: string, currentStatus: DeliveryStatus) {
    let nextStatus: DeliveryStatus;
    if (currentStatus === 'pending') nextStatus = 'picked_up';
    else if (currentStatus === 'picked_up') nextStatus = 'delivered';
    else return;

    setUpdatingId(deliveryId);
    try {
      await updateDeliveryStatus(deliveryId, nextStatus);
      addToast(`Status updated to ${nextStatus.replace('_', ' ')}`, 'success');
      loadDeliveries();
    } catch (err) {
      addToast('Failed to update status', 'error');
    } finally {
      setUpdatingId(null);
    }
  }

  const completedToday = activeDeliveries.filter(d => d.status === 'delivered').length;
  const earnings = completedToday * 40; // Example: ₹40 per delivery

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mt-4 px-1">
        <div>
          <h1 className="text-[36px] font-black text-slate-900 tracking-tight leading-tight">
            Deliveries
          </h1>
          <p className="text-sm font-medium text-slate-400 mt-1">
            Your assigned tasks for today
          </p>
        </div>
        
        <div className="flex flex-col items-end gap-3">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-brand to-brand-600 flex items-center justify-center text-white text-xl font-bold shadow-md overflow-hidden cursor-pointer group shrink-0"
          >
            {user?.image ? (
              <Image 
                src={cloudinaryUrl(user.image, 100, 100)} 
                alt={user.name || 'Profile'} 
                fill 
                className="object-cover" 
              />
            ) : (
              <span>{user?.name?.[0]?.toUpperCase() ?? '?'}</span>
            )}
            
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="w-4 h-4 text-white" />
            </div>

            {loadingImage && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleImageChange} 
          />
          <button
            onClick={logout}
            className="btn-outline text-[9px] py-1 px-3"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Live Tracking Status */}
      <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center animate-pulse">
            <Navigation className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-[11px] font-black text-emerald-700 uppercase tracking-wider">GPS Active</p>
            <p className="text-[10px] text-emerald-600 font-medium">Tracking your live location</p>
          </div>
        </div>
        <div className="flex gap-1">
          {[1, 2, 3].map(i => <div key={i} className="w-1 h-1 rounded-full bg-emerald-300" />)}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Delivered</p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl font-black text-slate-900 leading-none">{completedToday}</h3>
            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
              <Truck className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="card">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Earnings</p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl font-black text-emerald-600 leading-none">₹{earnings}</h3>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Active Deliveries */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-900 ml-1">Current Tasks</h3>
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-32 bg-white rounded-3xl animate-pulse shadow-sm border border-slate-50" />
            ))}
          </div>
        ) : activeDeliveries.filter(d => d.status !== 'delivered').length === 0 ? (
          <div className="bg-white rounded-3xl p-10 flex flex-col items-center text-center shadow-sm border border-slate-50">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <Truck className="w-8 h-8 text-slate-200" />
            </div>
            <p className="font-bold text-slate-900">All caught up!</p>
            <p className="text-xs text-slate-400 mt-1">No pending deliveries assigned to you.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeDeliveries.filter(d => d.status !== 'delivered').map((delivery) => (
              <div key={delivery.id} className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 group">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand flex items-center justify-center shadow-sm">
                      <Navigation className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{delivery.customer_name}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{delivery.vendor_name}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${
                    delivery.status === 'picked_up' ? 'bg-brand-50 text-brand' : 'bg-amber-50 text-amber-600'
                  }`}>
                    {delivery.status.replace('_', ' ')}
                  </span>
                </div>
                
                <div className="space-y-2 mb-4 ml-1">
                  <div className="flex items-start gap-2">
                    <Navigation className="w-3 h-3 text-slate-300 mt-0.5 shrink-0" />
                    <p className="text-xs text-slate-500 font-medium leading-tight">{delivery.address}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-slate-300 shrink-0" />
                    <p className="text-xs text-slate-500 font-medium">{delivery.time_slot || 'ASAP'}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={() => handleStatusUpdate(delivery.id, delivery.status)}
                    disabled={updatingId === delivery.id}
                    className={`flex-1 rounded-2xl py-3.5 text-xs font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
                      delivery.status === 'picked_up' 
                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' 
                        : 'bg-brand text-white shadow-lg shadow-brand/20'
                    }`}
                  >
                    {updatingId === delivery.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : delivery.status === 'picked_up' ? (
                      'Mark as Delivered'
                    ) : (
                      'Pick Up Order'
                    )}
                  </button>
                  <button 
                    onClick={() => {
                      const encodedAddress = encodeURIComponent(delivery.address);
                      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`, '_blank');
                    }}
                    className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-brand-50 hover:text-brand transition-colors border border-slate-100"
                    title="GPS Navigation"
                  >
                    <Navigation className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
