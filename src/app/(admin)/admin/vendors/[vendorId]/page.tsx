'use client';

import { useState, useEffect, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getUserById, setVendorApproval } from '@/lib/queries/users';
import { getVendorStats, getVendorOrderHistory, suspendVendor, unsuspendVendor, VendorPerformance } from '@/lib/queries/vendorAdmin';
import { AppUser, Order } from '@/types';
import { useUiStore } from '@/store/uiStore';
import { ArrowLeft, Check, X, ShieldAlert, Award, Star, DollarSign, Users, ShoppingBag, Clock, ShieldCheck, Edit3, Loader2, UploadCloud, MapPin, Settings } from 'lucide-react';
import Image from 'next/image';
import { getImageUrl, uploadImage } from '@/lib/storage';
import { SkeletonDetail } from '@/components/shared/Skeleton';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { toast } from 'react-hot-toast';

interface PageProps {
  params: Promise<{ vendorId: string }>;
}

export default function VendorDetail(props: PageProps) {
  const params = use(props.params);
  const vendorId = params.vendorId;
  const router = useRouter();
  const addToast = useUiStore((s) => s.addToast);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [vendor, setVendor] = useState<AppUser | null>(null);
  const [stats, setStats] = useState<VendorPerformance | null>(null);
  const [history, setHistory] = useState<Order[]>([]);
  const [actionLoading, setActionLoading] = useState(false);

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editForm, setEditForm] = useState({
    kitchen_name: '',
    name: '',
    cuisine_type: '',
    phone: '',
    email: '',
    address: '',
    lat: '',
    lng: '',
    capacity: '',
    capacityUnlimited: false,
    rate_onetime: '',
    rate_lunch_weekly: '',
    rate_lunch_monthly: '',
    rate_dinner_weekly: '',
    rate_dinner_monthly: '',
    rate_both_weekly: '',
    rate_both_monthly: '',
    image: ''
  });

  useEffect(() => {
    loadVendorData();
  }, [vendorId]);

  async function loadVendorData() {
    setLoading(true);
    try {
      const vendorData = await getUserById(vendorId);
      if (!vendorData || vendorData.role !== 'vendor') {
        addToast('Vendor not found', 'error');
        router.push('/admin/vendors');
        return;
      }
      setVendor(vendorData);
      
      // Initialize edit form values
      setEditForm({
        kitchen_name: vendorData.kitchen_name || '',
        name: vendorData.name || '',
        cuisine_type: vendorData.cuisine_type || '',
        phone: vendorData.phone || '',
        email: vendorData.email || '',
        address: vendorData.address || '',
        lat: vendorData.location?.lat ? String(vendorData.location.lat) : '',
        lng: vendorData.location?.lng ? String(vendorData.location.lng) : '',
        capacity: vendorData.capacity ? String(vendorData.capacity) : '50',
        capacityUnlimited: vendorData.capacityUnlimited || false,
        rate_onetime: vendorData.rate_onetime ? String(vendorData.rate_onetime) : '',
        rate_lunch_weekly: vendorData.rate_lunch_weekly ? String(vendorData.rate_lunch_weekly) : '',
        rate_lunch_monthly: vendorData.rate_lunch_monthly ? String(vendorData.rate_lunch_monthly) : '',
        rate_dinner_weekly: vendorData.rate_dinner_weekly ? String(vendorData.rate_dinner_weekly) : '',
        rate_dinner_monthly: vendorData.rate_dinner_monthly ? String(vendorData.rate_dinner_monthly) : '',
        rate_both_weekly: vendorData.rate_both_weekly ? String(vendorData.rate_both_weekly) : '',
        rate_both_monthly: vendorData.rate_both_monthly ? String(vendorData.rate_both_monthly) : '',
        image: vendorData.image || ''
      });

      const vendorStats = await getVendorStats(vendorId);
      setStats(vendorStats);

      const vendorHistory = await getVendorOrderHistory(vendorId);
      setHistory(vendorHistory);
    } catch (err) {
      addToast('Failed to load vendor profile', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleApproval(approved: boolean) {
    if (!vendor) return;
    setActionLoading(true);
    try {
      await setVendorApproval(vendor.id, approved);
      setVendor({ ...vendor, is_approved: approved });
      addToast(approved ? 'Vendor approved! ✅' : 'Vendor rejected', 'info');
    } catch (err) {
      addToast('Failed to update status', 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSuspension(suspend: boolean) {
    if (!vendor) return;
    setActionLoading(true);
    try {
      if (suspend) {
        await suspendVendor(vendor.id);
        setVendor({ ...vendor, is_approved: false, is_suspended: true } as any);
        addToast('Vendor account suspended', 'warning');
      } else {
        await unsuspendVendor(vendor.id);
        setVendor({ ...vendor, is_approved: true, is_suspended: false } as any);
        addToast('Vendor account unsuspended', 'success');
      }
    } catch (err) {
      addToast('Failed to toggle suspension', 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !vendor) return;

    setUploadingImage(true);
    try {
      const url = await uploadImage(file, `uploads/vendors/${vendor.id}`);
      if (url) {
        setEditForm(prev => ({ ...prev, image: url }));
        // Instantly save to Firestore if not already editing, or update the local edit form
        await updateDoc(doc(db, 'users', vendor.id), { image: url });
        setVendor(prev => prev ? { ...prev, image: url } : null);
        addToast('Vendor picture updated! 📸', 'success');
      } else {
        addToast('Failed to upload image. Check permissions/formats.', 'error');
      }
    } catch (err) {
      addToast('Error uploading picture', 'error');
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!vendor) return;

    setActionLoading(true);
    try {
      const updatedFields: any = {
        kitchen_name: editForm.kitchen_name.trim(),
        name: editForm.name.trim(),
        cuisine_type: editForm.cuisine_type.trim(),
        phone: editForm.phone.trim(),
        email: editForm.email.trim(),
        address: editForm.address.trim(),
        capacityUnlimited: editForm.capacityUnlimited,
        capacity: editForm.capacityUnlimited ? null : Number(editForm.capacity || 50),
        rate_onetime: Number(editForm.rate_onetime || 0),
        rate_lunch_weekly: Number(editForm.rate_lunch_weekly || 0),
        rate_lunch_monthly: Number(editForm.rate_lunch_monthly || 0),
        rate_dinner_weekly: Number(editForm.rate_dinner_weekly || 0),
        rate_dinner_monthly: Number(editForm.rate_dinner_monthly || 0),
        rate_both_weekly: Number(editForm.rate_both_weekly || 0),
        rate_both_monthly: Number(editForm.rate_both_monthly || 0),
        image: editForm.image
      };

      if (editForm.lat && editForm.lng) {
        updatedFields.location = {
          lat: Number(editForm.lat),
          lng: Number(editForm.lng)
        };
      }

      await updateDoc(doc(db, 'users', vendor.id), updatedFields);
      setVendor(prev => prev ? { ...prev, ...updatedFields } : null);
      setIsEditing(false);
      addToast('Vendor profile saved successfully! 🎉', 'success');
    } catch (err) {
      console.error(err);
      addToast('Failed to update vendor details', 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCreateRazorpayAccount() {
    if (!vendor) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/razorpay/create-vendor-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_id: vendor.id })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to link account');
      }

      setVendor(prev => prev ? { ...prev, rzp_account_id: data.account_id, rzp_bank_status: 'active' } : null);
      addToast('Razorpay vendor account linked successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      addToast(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return <SkeletonDetail />;
  }

  if (!vendor || !stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-500">
        <X className="w-12 h-12 text-rose-400 mb-2" />
        <h3 className="font-bold text-lg">Vendor Profile Unavailable</h3>
        <button onClick={() => router.push('/admin/vendors')} className="btn btn-secondary mt-4">
          Back to list
        </button>
      </div>
    );
  }

  const isSuspended = (vendor as any).is_suspended === true;

  return (
    <div className="space-y-6 animate-fade-in pb-12 pr-4 pl-4">
      {/* Header Navigation */}
      <div className="flex items-center justify-between">
        <button 
          onClick={() => router.push('/admin/vendors')}
          className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Vendors
        </button>
        
        <div className="flex gap-2">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="px-4 py-2 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded-2xl text-xs font-black uppercase tracking-wider shadow-sm transition-colors flex items-center gap-1.5"
          >
            <Settings className="w-4 h-4" /> {isEditing ? 'View Analytics' : 'Edit Profile'}
          </button>

          {isSuspended ? (
            <button
              onClick={() => handleSuspension(false)}
              disabled={actionLoading}
              className="px-4 py-2 bg-emerald-500 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-sm hover:bg-emerald-600 transition-colors flex items-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4" /> Unsuspend Kitchen
            </button>
          ) : !vendor.is_approved ? (
            <div className="flex gap-2">
              <button
                onClick={() => handleApproval(true)}
                disabled={actionLoading}
                className="px-4 py-2 bg-emerald-500 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-sm hover:bg-emerald-600 transition-colors flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" /> Approve Vendor
              </button>
            </div>
          ) : (
            <button
              onClick={() => handleSuspension(true)}
              disabled={actionLoading}
              className="px-4 py-2 bg-rose-500 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-sm hover:bg-rose-600 transition-colors flex items-center gap-1.5"
            >
              <ShieldAlert className="w-4 h-4" /> Suspend Kitchen
            </button>
          )}
        </div>
      </div>

      {/* Main Vendor Profile Info */}
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-card flex flex-col md:flex-row gap-6 items-start md:items-center">
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="w-24 h-24 rounded-3xl bg-slate-50 relative overflow-hidden flex-shrink-0 shadow-inner flex items-center justify-center border border-slate-100 cursor-pointer group"
        >
          {editForm.image ? (
            <Image 
              src={getImageUrl(editForm.image)} 
              alt={vendor.kitchen_name || vendor.name} 
              fill 
              className="object-cover animate-fade-in" 
              unoptimized
            />
          ) : (
            <span className="text-4xl">🏪</span>
          )}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white">
            <UploadCloud className="w-5 h-5 mb-0.5" />
            <span className="text-[8px] font-black uppercase tracking-widest text-center">Upload</span>
          </div>
          {uploadingImage && (
            <div className="absolute inset-0 bg-white/85 backdrop-blur-sm flex items-center justify-center">
              <Loader2 className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*" 
          onChange={handleImageUpload} 
        />

        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-extrabold text-slate-900">{vendor.kitchen_name || `${vendor.name}'s Kitchen`}</h1>
            {isSuspended ? (
              <span className="text-[10px] font-bold text-rose-500 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">Suspended</span>
            ) : vendor.is_approved ? (
              <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200 flex items-center gap-0.5">Approved</span>
            ) : (
              <span className="text-[10px] font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">Pending Review</span>
            )}
          </div>
          <p className="text-sm text-slate-500 font-medium">{vendor.cuisine_type || 'General Cuisine'}</p>
          <div className="flex items-center gap-4 text-xs text-slate-400 mt-2 flex-wrap">
            <span>📞 {vendor.phone}</span>
            <span>✉️ {vendor.email || 'No email provided'}</span>
            {vendor.address && <span>📍 {vendor.address}</span>}
          </div>
        </div>
      </div>

      {isEditing ? (
        /* Edit Profile & Rate Card Form */
        <form onSubmit={handleSaveProfile} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-card space-y-6 animate-fade-in">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="text-base font-black text-slate-900">Update Profile Details & Rates</h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase">Vendor: {vendor.id.slice(0, 8)}</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left Side: General Profile */}
            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase tracking-wider text-brand flex items-center gap-1.5">
                <Edit3 className="w-4 h-4" /> Profile Info
              </h4>
              
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Kitchen / Brand Name</label>
                <input 
                  type="text" 
                  value={editForm.kitchen_name} 
                  onChange={e => setEditForm({ ...editForm, kitchen_name: e.target.value })}
                  placeholder="e.g. Royal Tiffins"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand/40 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Contact Person Name</label>
                <input 
                  type="text" 
                  value={editForm.name} 
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand/40 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Cuisine / Food Tags</label>
                <input 
                  type="text" 
                  value={editForm.cuisine_type} 
                  onChange={e => setEditForm({ ...editForm, cuisine_type: e.target.value })}
                  placeholder="e.g. North Indian, Jain Food"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand/40 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Contact Phone</label>
                  <input 
                    type="text" 
                    value={editForm.phone} 
                    onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand/40 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Email ID</label>
                  <input 
                    type="email" 
                    value={editForm.email} 
                    onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand/40 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Kitchen Address</label>
                <textarea 
                  value={editForm.address} 
                  onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-medium text-slate-900 focus:outline-none focus:border-brand/40 transition-colors resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Latitude</label>
                  <input 
                    type="number" 
                    step="any"
                    value={editForm.lat} 
                    onChange={e => setEditForm({ ...editForm, lat: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand/40 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Longitude</label>
                  <input 
                    type="number" 
                    step="any"
                    value={editForm.lng} 
                    onChange={e => setEditForm({ ...editForm, lng: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand/40 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 items-center">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Tiffin Prep Capacity</label>
                  <input 
                    type="number" 
                    disabled={editForm.capacityUnlimited}
                    value={editForm.capacity} 
                    onChange={e => setEditForm({ ...editForm, capacity: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand/40 transition-colors disabled:opacity-40"
                  />
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <input 
                    type="checkbox" 
                    id="capacityUnlimited"
                    checked={editForm.capacityUnlimited} 
                    onChange={e => setEditForm({ ...editForm, capacityUnlimited: e.target.checked })}
                    className="accent-brand"
                  />
                  <label htmlFor="capacityUnlimited" className="text-xs font-bold text-slate-700 cursor-pointer">Unlimited Capacity</label>
                </div>
              </div>
            </div>

            {/* Right Side: Rate Cards */}
            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase tracking-wider text-brand flex items-center gap-1.5">
                <DollarSign className="w-4 h-4" /> Subscription Rate Cards
              </h4>
              
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">One-Time Meal Price (₹)</label>
                <input 
                  type="number" 
                  value={editForm.rate_onetime} 
                  onChange={e => setEditForm({ ...editForm, rate_onetime: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand/40 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Lunch Weekly Rate (₹)</label>
                  <input 
                    type="number" 
                    value={editForm.rate_lunch_weekly} 
                    onChange={e => setEditForm({ ...editForm, rate_lunch_weekly: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand/40 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Lunch Monthly Rate (₹)</label>
                  <input 
                    type="number" 
                    value={editForm.rate_lunch_monthly} 
                    onChange={e => setEditForm({ ...editForm, rate_lunch_monthly: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand/40 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Dinner Weekly Rate (₹)</label>
                  <input 
                    type="number" 
                    value={editForm.rate_dinner_weekly} 
                    onChange={e => setEditForm({ ...editForm, rate_dinner_weekly: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand/40 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Dinner Monthly Rate (₹)</label>
                  <input 
                    type="number" 
                    value={editForm.rate_dinner_monthly} 
                    onChange={e => setEditForm({ ...editForm, rate_dinner_monthly: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand/40 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Combo Weekly Rate (₹)</label>
                  <input 
                    type="number" 
                    value={editForm.rate_both_weekly} 
                    onChange={e => setEditForm({ ...editForm, rate_both_weekly: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand/40 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Combo Monthly Rate (₹)</label>
                  <input 
                    type="number" 
                    value={editForm.rate_both_monthly} 
                    onChange={e => setEditForm({ ...editForm, rate_both_monthly: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand/40 transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5 flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="py-3.5 px-6 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-2xl transition-colors active:scale-95"
            >
              Discard Changes
            </button>
            <button
              type="submit"
              disabled={actionLoading}
              className="py-3.5 px-8 bg-brand text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-colors active:scale-95 shadow-md shadow-brand/20 disabled:opacity-50 flex items-center gap-1.5"
            >
              {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      ) : (
        <>
          {/* Grid of Key Analytics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
            <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-card flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-orange-50 text-orange-500 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Subscribers</p>
                <h3 className="text-lg font-black text-slate-900">{stats.activeSubscribers}</h3>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-card flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Revenue</p>
                <h3 className="text-lg font-black text-slate-900">₹{stats.totalRevenue.toLocaleString('en-IN')}</h3>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-card flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Orders Made</p>
                <h3 className="text-lg font-black text-slate-900">{stats.totalOrders}</h3>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-card flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-500 flex items-center justify-center">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Success Rate</p>
                <h3 className="text-lg font-black text-slate-900">{stats.deliverySuccessRate}%</h3>
              </div>
            </div>
          </div>

          {/* History & Details Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
            {/* Left Column: Details & Pricing */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-card space-y-4">
              <h3 className="text-md font-extrabold text-slate-900 border-b border-slate-100 pb-3">Kitchen Details</h3>
              
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Ratings Profile:</span>
                  <span className="font-bold text-slate-900 flex items-center gap-0.5">
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" /> 
                    {vendor.rating_avg ? vendor.rating_avg.toFixed(1) : 'New'} ({vendor.review_count || 0} reviews)
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">One-Time Rate:</span>
                  <span className="font-bold text-slate-900">₹{vendor.rate_onetime || 0}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Lunch Weekly/Monthly:</span>
                  <span className="font-bold text-slate-900">₹{vendor.rate_lunch_weekly || 0} / ₹{vendor.rate_lunch_monthly || 0}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Dinner Weekly/Monthly:</span>
                  <span className="font-bold text-slate-900">₹{vendor.rate_dinner_weekly || 0} / ₹{vendor.rate_dinner_monthly || 0}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Combo Weekly/Monthly:</span>
                  <span className="font-bold text-slate-900">₹{vendor.rate_both_weekly || 0} / ₹{vendor.rate_both_monthly || 0}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Capacity Limits:</span>
                  <span className="font-bold text-slate-900">{vendor.capacityUnlimited ? 'Unlimited' : `${vendor.capacity || 'Omit'} Tiffins`}</span>
                </div>

                {vendor.location?.lat && vendor.location?.lng && (
                  <div className="flex justify-between pt-2 border-t border-slate-50">
                    <span className="text-slate-400 font-medium flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Coordinates:</span>
                    <span className="font-bold text-slate-900 text-right">{vendor.location.lat.toFixed(5)}, {vendor.location.lng.toFixed(5)}</span>
                  </div>
                )}
              </div>

              {/* Razorpay Settlements Block */}
              <div className="mt-6 pt-4 border-t border-slate-100">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">Settlements & Payouts</h4>
                
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  {vendor.rzp_account_id ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-xs font-bold text-emerald-700">Razorpay Route Active</span>
                      </div>
                      <p className="text-[10px] font-bold text-slate-500 font-mono bg-white px-2 py-1 rounded border border-slate-200 inline-block">ID: {vendor.rzp_account_id}</p>
                      <p className="text-[10px] text-slate-400 font-medium">Platform Fee Commission: <span className="font-bold text-slate-700">{vendor.platform_fee_pct || 10}%</span></p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="text-xs font-bold text-amber-700">Not Linked to Razorpay</span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                        Vendor settlements are manual. Link a Razorpay Route account to automate split payments instantly on every checkout.
                      </p>
                      {vendor.bank_details ? (
                        <button
                          onClick={handleCreateRazorpayAccount}
                          disabled={actionLoading}
                          className="w-full mt-2 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                          {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <DollarSign className="w-3.5 h-3.5" />}
                          Create Connected Account
                        </button>
                      ) : (
                        <div className="text-[10px] font-bold text-rose-500 bg-rose-50 px-3 py-2 rounded-xl">
                          Bank Details Missing. Ask vendor to update profile.
                        </div>
                      )}
                    </div>
                  )}

                  {vendor.bank_details && (
                    <div className="mt-4 pt-3 border-t border-slate-200 space-y-1 text-[10px]">
                      <p className="text-slate-400 font-bold uppercase tracking-wider mb-1">Bank Information</p>
                      <p className="flex justify-between"><span className="text-slate-500">Beneficiary:</span> <span className="font-bold text-slate-900">{vendor.bank_details.beneficiary_name}</span></p>
                      <p className="flex justify-between"><span className="text-slate-500">Account No:</span> <span className="font-bold text-slate-900 font-mono">{vendor.bank_details.account_number}</span></p>
                      <p className="flex justify-between"><span className="text-slate-500">IFSC:</span> <span className="font-bold text-slate-900 font-mono">{vendor.bank_details.ifsc}</span></p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Order History */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-card lg:col-span-2 space-y-4">
              <h3 className="text-md font-extrabold text-slate-900 border-b border-slate-100 pb-3">Recent Orders</h3>
              
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-slate-400">
                  <span className="text-2xl mb-1">📋</span>
                  <p className="text-xs font-semibold">No order history found for this kitchen.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto pr-1">
                  {history.map((order) => (
                    <div key={order.id} className="py-3 flex items-center justify-between text-xs hover:bg-slate-50/40 rounded-xl px-2 transition-colors">
                      <div>
                        <p className="font-bold text-slate-900">Order ID: {order.id.slice(-8).toUpperCase()}</p>
                        <p className="text-slate-400 mt-0.5">Date: {order.date} | Slot: {order.delivery_slot || 'N/A'}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-black uppercase tracking-wider text-slate-500">{order.meal_type}</span>
                        <span className={`px-2.5 py-1 rounded-full font-bold uppercase text-[9px] tracking-wide ${
                          ['delivered', 'completed'].includes(order.status)
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                            : order.status === 'failed'
                            ? 'bg-rose-50 text-rose-600 border border-rose-100'
                            : 'bg-orange-50 text-orange-600 border border-orange-100'
                        }`}>
                          {order.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
