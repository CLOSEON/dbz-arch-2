'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AppUser } from '@/types';
import { X, MapPin, Navigation, ChefHat, CheckCircle2 } from 'lucide-react';
import { requestVendorSwap } from '@/lib/queries/swaps';

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}

interface VendorWithDistance extends AppUser {
  distance: number;
}

interface SwapVendorModalProps {
  isOpen: boolean;
  onClose: () => void;
  userLocation: { lat: number, lng: number };
  userId: string;
  delivery: any;
  onSwapSuccess: (deliveryId: string) => void;
}

export function SwapVendorModal({ isOpen, onClose, userLocation, userId, delivery, onSwapSuccess }: SwapVendorModalProps) {
  const [vendors, setVendors] = useState<VendorWithDistance[]>([]);
  const [loading, setLoading] = useState(true);
  const [swappingId, setSwappingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    
    async function fetchNearbyVendors() {
      setLoading(true);
      setError(null);
      try {
        const q = query(collection(db, 'users'), where('role', '==', 'vendor'));
        const snap = await getDocs(q);
        const nearby: VendorWithDistance[] = [];
        
        snap.docs.forEach(doc => {
          const data = doc.data() as AppUser;
          // Skip current vendor
          if (doc.id === delivery.vendorId) return;
          
          if (data.location?.lat && data.location?.lng) {
            const dist = getDistance(userLocation.lat, userLocation.lng, data.location.lat, data.location.lng);
            if (dist <= 2.0) {
              nearby.push({ ...data, distance: dist });
            }
          }
        });
        
        // Sort by distance
        nearby.sort((a, b) => a.distance - b.distance);
        setVendors(nearby);
      } catch (err) {
        setError('Failed to load nearby vendors');
      } finally {
        setLoading(false);
      }
    }
    
    fetchNearbyVendors();
  }, [isOpen, userLocation, delivery.vendorId]);

  const handleSwap = async (vendor: VendorWithDistance) => {
    if (swappingId) return;
    setSwappingId(vendor.id);
    setError(null);
    try {
      await requestVendorSwap(userId, delivery.subscriptionId, delivery, vendor.id, vendor.kitchen_name || vendor.name);
      onSwapSuccess(delivery.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Swap failed');
      setSwappingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-black/5 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">Swap Your Meal</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Pick a vendor within 2km</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-4 flex-1">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-2xl text-xs font-semibold text-center">
              {error}
            </div>
          )}
          
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Finding vendors...</p>
            </div>
          ) : vendors.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center px-4">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                <MapPin className="w-6 h-6 text-slate-300" />
              </div>
              <h3 className="font-bold text-slate-700">No vendors nearby</h3>
              <p className="text-sm text-slate-500 mt-1">We couldn't find any other vendors within 2km of your location.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {vendors.map(vendor => (
                <div key={vendor.id} className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                        <ChefHat className="w-5 h-5 text-orange-500" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm leading-tight">
                          {vendor.kitchen_name || vendor.name}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-1 text-[11px] font-medium text-slate-500">
                          <Navigation className="w-3 h-3" />
                          <span>{vendor.distance.toFixed(1)} km away</span>
                          {vendor.cuisine_type && (
                            <>
                              <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                              <span>{vendor.cuisine_type}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleSwap(vendor)}
                    disabled={swappingId !== null}
                    className="w-full mt-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 bg-blue-50 text-blue-600 hover:bg-blue-100 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {swappingId === vendor.id ? (
                      <span className="flex items-center gap-2"><div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-blue-600 rounded-full animate-spin"></div> Swapping...</span>
                    ) : (
                      <><CheckCircle2 className="w-3.5 h-3.5" /> Select Vendor</>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
