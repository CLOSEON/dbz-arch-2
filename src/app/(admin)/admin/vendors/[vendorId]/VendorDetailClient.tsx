'use client';

import { useState, useEffect, use, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getUserById, setVendorApproval } from '@/lib/queries/users';
import { getVendorStats, getVendorOrderHistory, suspendVendor, unsuspendVendor, VendorPerformance } from '@/lib/queries/vendorAdmin';
import { getVendorSubscriptions } from '@/lib/queries/subscriptions';
import { getDailyMenu, saveDailyMenu, getTodayStr } from '@/lib/queries/menu';
import { AppUser, Order, DietaryCategory, VendorAddon, Subscription, MenuItem } from '@/types';
import { useUiStore } from '@/store/uiStore';
import { 
  ArrowLeft, Check, X, ShieldAlert, Award, DollarSign, Users, 
  ShoppingBag, ShieldCheck, Edit3, Loader2, UploadCloud, MapPin, 
  Settings, Tag, Trash2, Plus, Leaf, Drumstick, UtensilsCrossed,
  ExternalLink, Phone, Mail, CreditCard, Clock, BarChart3,
  Package, Sliders, CheckCircle2, AlertCircle, Building2, Store
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { getImageUrl, uploadImage } from '@/lib/storage';
import { SkeletonDetail } from '@/components/shared/Skeleton';
import { db } from '@/lib/firebase';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';

interface PageProps {
  params?: Promise<{ vendorId?: string }>;
}

type ActiveTab = 'overview' | 'menu' | 'pricing' | 'subscribers' | 'orders' | 'settings';

export default function VendorDetailClient(props: PageProps) {
  const searchParams = useSearchParams();
  const rawParams = props.params ? use(props.params) : null;
  const vendorId = (rawParams?.vendorId && rawParams.vendorId !== 'placeholder')
    ? rawParams.vendorId
    : (searchParams.get('vendorId') || searchParams.get('id') || '');

  const router = useRouter();
  const addToast = useUiStore((s) => s.addToast);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [vendor, setVendor] = useState<AppUser | null>(null);
  const [stats, setStats] = useState<VendorPerformance | null>(null);
  const [history, setHistory] = useState<Order[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [actionLoading, setActionLoading] = useState(false);

  // Tab State
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  // Menu State
  const [menuDate, setMenuDate] = useState<string>(getTodayStr());
  const [menuLoading, setMenuLoading] = useState(false);
  const [vegItems, setVegItems] = useState<string[]>([]);
  const [nonVegItems, setNonVegItems] = useState<string[]>([]);
  const [vegNote, setVegNote] = useState('');
  const [nonVegNote, setNonVegNote] = useState('');
  const [newVegItemInput, setNewVegItemInput] = useState('');
  const [newNonVegItemInput, setNewNonVegItemInput] = useState('');
  const [savingMenu, setSavingMenu] = useState(false);

  // New Add-On state
  const [newAddonName, setNewAddonName] = useState('');
  const [newAddonMonthlyPrice, setNewAddonMonthlyPrice] = useState('');
  const [newAddonDesc, setNewAddonDesc] = useState('');

  // Editing state for Profile & Pricing
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editForm, setEditForm] = useState<{
    kitchen_name: string;
    name: string;
    cuisine_type: string;
    phone: string;
    email: string;
    address: string;
    lat: string;
    lng: string;
    capacity: string;
    capacityUnlimited: boolean;
    fssai_license: string;
    upi_id: string;
    bank_account_number: string;
    bank_ifsc: string;
    bank_beneficiary: string;
    platform_fee_pct: string;
    dietary_categories: DietaryCategory[];
    rate_onetime: string;
    rate_lunch_weekly: string;
    rate_lunch_monthly: string;
    rate_dinner_weekly: string;
    rate_dinner_monthly: string;
    rate_both_weekly: string;
    rate_both_monthly: string;
    rate_veg_onetime: string;
    rate_veg_lunch_weekly: string;
    rate_veg_lunch_monthly: string;
    rate_veg_dinner_weekly: string;
    rate_veg_dinner_monthly: string;
    rate_veg_both_weekly: string;
    rate_veg_both_monthly: string;
    rate_nonveg_onetime: string;
    rate_nonveg_lunch_weekly: string;
    rate_nonveg_lunch_monthly: string;
    rate_nonveg_dinner_weekly: string;
    rate_nonveg_dinner_monthly: string;
    rate_nonveg_both_weekly: string;
    rate_nonveg_both_monthly: string;
    addons: VendorAddon[];
    image: string;
  }>({
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
    fssai_license: '',
    upi_id: '',
    bank_account_number: '',
    bank_ifsc: '',
    bank_beneficiary: '',
    platform_fee_pct: '10',
    dietary_categories: ['veg'],
    rate_onetime: '',
    rate_lunch_weekly: '',
    rate_lunch_monthly: '',
    rate_dinner_weekly: '',
    rate_dinner_monthly: '',
    rate_both_weekly: '',
    rate_both_monthly: '',
    rate_veg_onetime: '',
    rate_veg_lunch_weekly: '',
    rate_veg_lunch_monthly: '',
    rate_veg_dinner_weekly: '',
    rate_veg_dinner_monthly: '',
    rate_veg_both_weekly: '',
    rate_veg_both_monthly: '',
    rate_nonveg_onetime: '',
    rate_nonveg_lunch_weekly: '',
    rate_nonveg_lunch_monthly: '',
    rate_nonveg_dinner_weekly: '',
    rate_nonveg_dinner_monthly: '',
    rate_nonveg_both_weekly: '',
    rate_nonveg_both_monthly: '',
    addons: [],
    image: ''
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('edit') === 'true' || urlParams.get('tab') === 'pricing') {
        setActiveTab('pricing');
      } else if (urlParams.get('tab')) {
        const tab = urlParams.get('tab') as ActiveTab;
        if (['overview', 'menu', 'pricing', 'subscribers', 'orders', 'settings'].includes(tab)) {
          setActiveTab(tab);
        }
      }
    }
    if (vendorId) {
      loadVendorData();
    }
  }, [vendorId]);

  useEffect(() => {
    if (vendorId && menuDate) {
      loadDailyMenuData(menuDate);
    }
  }, [vendorId, menuDate]);

  async function loadVendorData() {
    if (!vendorId) return;
    setLoading(true);
    try {
      const vendorData = await getUserById(vendorId);
      if (!vendorData || vendorData.role !== 'vendor') {
        addToast('Vendor profile not found', 'error');
        router.push('/admin/vendors');
        return;
      }
      setVendor(vendorData);
      
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
        fssai_license: vendorData.fssai_license || '',
        upi_id: vendorData.upi_id || '',
        bank_account_number: vendorData.bank_details?.account_number || '',
        bank_ifsc: vendorData.bank_details?.ifsc || '',
        bank_beneficiary: vendorData.bank_details?.beneficiary_name || '',
        platform_fee_pct: vendorData.platform_fee_pct ? String(vendorData.platform_fee_pct) : '10',
        dietary_categories: vendorData.dietary_categories || ['veg'],
        rate_onetime: vendorData.rate_onetime ? String(vendorData.rate_onetime) : '',
        rate_lunch_weekly: vendorData.rate_lunch_weekly ? String(vendorData.rate_lunch_weekly) : '',
        rate_lunch_monthly: vendorData.rate_lunch_monthly ? String(vendorData.rate_lunch_monthly) : '',
        rate_dinner_weekly: vendorData.rate_dinner_weekly ? String(vendorData.rate_dinner_weekly) : '',
        rate_dinner_monthly: vendorData.rate_dinner_monthly ? String(vendorData.rate_dinner_monthly) : '',
        rate_both_weekly: vendorData.rate_both_weekly ? String(vendorData.rate_both_weekly) : '',
        rate_both_monthly: vendorData.rate_both_monthly ? String(vendorData.rate_both_monthly) : '',
        rate_veg_onetime: vendorData.rate_veg_onetime ? String(vendorData.rate_veg_onetime) : (vendorData.rate_onetime ? String(vendorData.rate_onetime) : ''),
        rate_veg_lunch_weekly: vendorData.rate_veg_lunch_weekly ? String(vendorData.rate_veg_lunch_weekly) : (vendorData.rate_lunch_weekly ? String(vendorData.rate_lunch_weekly) : ''),
        rate_veg_lunch_monthly: vendorData.rate_veg_lunch_monthly ? String(vendorData.rate_veg_lunch_monthly) : (vendorData.rate_lunch_monthly ? String(vendorData.rate_lunch_monthly) : ''),
        rate_veg_dinner_weekly: vendorData.rate_veg_dinner_weekly ? String(vendorData.rate_veg_dinner_weekly) : (vendorData.rate_dinner_weekly ? String(vendorData.rate_dinner_weekly) : ''),
        rate_veg_dinner_monthly: vendorData.rate_veg_dinner_monthly ? String(vendorData.rate_veg_dinner_monthly) : (vendorData.rate_dinner_monthly ? String(vendorData.rate_dinner_monthly) : ''),
        rate_veg_both_weekly: vendorData.rate_veg_both_weekly ? String(vendorData.rate_veg_both_weekly) : (vendorData.rate_both_weekly ? String(vendorData.rate_both_weekly) : ''),
        rate_veg_both_monthly: vendorData.rate_veg_both_monthly ? String(vendorData.rate_veg_both_monthly) : (vendorData.rate_both_monthly ? String(vendorData.rate_both_monthly) : ''),
        rate_nonveg_onetime: vendorData.rate_nonveg_onetime ? String(vendorData.rate_nonveg_onetime) : '',
        rate_nonveg_lunch_weekly: vendorData.rate_nonveg_lunch_weekly ? String(vendorData.rate_nonveg_lunch_weekly) : '',
        rate_nonveg_lunch_monthly: vendorData.rate_nonveg_lunch_monthly ? String(vendorData.rate_nonveg_lunch_monthly) : '',
        rate_nonveg_dinner_weekly: vendorData.rate_nonveg_dinner_weekly ? String(vendorData.rate_nonveg_dinner_weekly) : '',
        rate_nonveg_dinner_monthly: vendorData.rate_nonveg_dinner_monthly ? String(vendorData.rate_nonveg_dinner_monthly) : '',
        rate_nonveg_both_weekly: vendorData.rate_nonveg_both_weekly ? String(vendorData.rate_nonveg_both_weekly) : '',
        rate_nonveg_both_monthly: vendorData.rate_nonveg_both_monthly ? String(vendorData.rate_nonveg_both_monthly) : '',
        addons: vendorData.addons || [],
        image: vendorData.image || ''
      });

      const [vendorStats, vendorHistory, vendorSubs] = await Promise.all([
        getVendorStats(vendorId),
        getVendorOrderHistory(vendorId),
        getVendorSubscriptions(vendorId)
      ]);
      setStats(vendorStats);
      setHistory(vendorHistory);
      setSubscriptions(vendorSubs);
    } catch (err) {
      addToast('Failed to load vendor profile', 'error');
    } finally {
      setLoading(false);
    }
  }

  const normalizeItems = (items?: (MenuItem | string)[]): string[] => {
    if (!items || !Array.isArray(items)) return [];
    return items.map(item => typeof item === 'string' ? item : (item.name || ''));
  };

  async function loadDailyMenuData(dateStr: string) {
    setMenuLoading(true);
    try {
      const menu = await getDailyMenu(vendorId, dateStr);
      if (menu) {
        setVegItems(normalizeItems(menu.items_veg || menu.items));
        setNonVegItems(normalizeItems(menu.items_non_veg));
        setVegNote(menu.note_veg || menu.note || '');
        setNonVegNote(menu.note_non_veg || '');
      } else {
        setVegItems(['Paneer Butter Masala', 'Dal Tadka', 'Jeera Rice', '4 Butter Phulkas', 'Gulab Jamun']);
        setNonVegItems(['Homestyle Chicken Curry', 'Dal Tadka', 'Steamed Basmati Rice', '4 Butter Phulkas', 'Gulab Jamun']);
        setVegNote('Fresh homestyle cooked pure-vegetarian meal');
        setNonVegNote('Fresh tender chicken curry with homestyle spices');
      }
    } catch (err) {
      console.error('Failed to load daily menu:', err);
    } finally {
      setMenuLoading(false);
    }
  }

  async function handleSaveMenu() {
    setSavingMenu(true);
    try {
      await saveDailyMenu(vendorId, menuDate, {
        items_veg: vegItems,
        items_non_veg: nonVegItems,
        items: vegItems,
        note_veg: vegNote,
        note_non_veg: nonVegNote,
        note: vegNote,
      });
      addToast(`Menu for ${menuDate} published successfully`, 'success');
    } catch (err) {
      addToast('Failed to save menu', 'error');
    } finally {
      setSavingMenu(false);
    }
  }

  const handleAddVegItem = () => {
    if (!newVegItemInput.trim()) return;
    setVegItems([...vegItems, newVegItemInput.trim()]);
    setNewVegItemInput('');
  };

  const handleRemoveVegItem = (idx: number) => {
    setVegItems(vegItems.filter((_, i) => i !== idx));
  };

  const handleAddNonVegItem = () => {
    if (!newNonVegItemInput.trim()) return;
    setNonVegItems([...nonVegItems, newNonVegItemInput.trim()]);
    setNewNonVegItemInput('');
  };

  const handleRemoveNonVegItem = (idx: number) => {
    setNonVegItems(nonVegItems.filter((_, i) => i !== idx));
  };

  const handleAddAddon = () => {
    if (!newAddonName.trim() || !newAddonMonthlyPrice) {
      addToast('Please enter an add-on name and monthly price', 'error');
      return;
    }
    const monthly = Number(newAddonMonthlyPrice);
    const newAddon: VendorAddon = {
      id: 'addon_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: newAddonName.trim(),
      monthly_price: monthly,
      weekly_price: Math.round(monthly / 4),
      onetime_price: Math.round(monthly / 30),
      active: true,
      description: newAddonDesc.trim() || undefined,
    };
    setEditForm(prev => ({
      ...prev,
      addons: [...prev.addons, newAddon]
    }));
    setNewAddonName('');
    setNewAddonMonthlyPrice('');
    setNewAddonDesc('');
    addToast('Add-on added to catalog', 'success');
  };

  const handleToggleAddonActive = (id: string) => {
    setEditForm(prev => ({
      ...prev,
      addons: prev.addons.map(a => a.id === id ? { ...a, active: !a.active } : a)
    }));
  };

  const handleRemoveAddon = (id: string) => {
    setEditForm(prev => ({
      ...prev,
      addons: prev.addons.filter(a => a.id !== id)
    }));
  };

  async function handleApproval(approved: boolean) {
    if (!vendor) return;
    setActionLoading(true);
    try {
      await setVendorApproval(vendor.id, approved);
      setVendor({ ...vendor, is_approved: approved });
      addToast(approved ? 'Vendor approved successfully' : 'Vendor status updated', 'info');
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

  async function handleUpdateSubscriptionStatus(subId: string, newStatus: 'active' | 'paused' | 'cancelled') {
    setActionLoading(true);
    try {
      await updateDoc(doc(db, 'subscriptions', subId), { 
        status: newStatus,
        updated_at: Timestamp.now()
      });
      setSubscriptions(prev => prev.map(s => s.id === subId ? { ...s, status: newStatus } : s));
      addToast(`Subscription status updated to ${newStatus}`, 'success');
    } catch (err) {
      addToast('Failed to update subscription', 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUpdateOrderStatus(orderId: string, newStatus: Order['status']) {
    setActionLoading(true);
    try {
      await updateDoc(doc(db, 'orders', orderId), { 
        status: newStatus,
        updated_at: Timestamp.now()
      });
      setHistory(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      addToast(`Order updated to ${newStatus}`, 'success');
    } catch (err) {
      addToast('Failed to update order status', 'error');
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
        await updateDoc(doc(db, 'users', vendor.id), { image: url });
        setVendor(prev => prev ? { ...prev, image: url } : null);
        addToast('Vendor picture updated', 'success');
      } else {
        addToast('Failed to upload image', 'error');
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
        fssai_license: editForm.fssai_license.trim(),
        upi_id: editForm.upi_id.trim(),
        bank_details: {
          account_number: editForm.bank_account_number.trim(),
          ifsc: editForm.bank_ifsc.trim().toUpperCase(),
          beneficiary_name: editForm.bank_beneficiary.trim(),
        },
        platform_fee_pct: Number(editForm.platform_fee_pct || 10),
        dietary_categories: editForm.dietary_categories,
        
        rate_onetime: Number(editForm.rate_veg_onetime || editForm.rate_onetime || 0),
        rate_lunch_weekly: Number(editForm.rate_veg_lunch_weekly || editForm.rate_lunch_weekly || 0),
        rate_lunch_monthly: Number(editForm.rate_veg_lunch_monthly || editForm.rate_lunch_monthly || 0),
        rate_dinner_weekly: Number(editForm.rate_veg_dinner_weekly || editForm.rate_dinner_weekly || 0),
        rate_dinner_monthly: Number(editForm.rate_veg_dinner_monthly || editForm.rate_dinner_monthly || 0),
        rate_both_weekly: Number(editForm.rate_veg_both_weekly || editForm.rate_both_weekly || 0),
        rate_both_monthly: Number(editForm.rate_veg_both_monthly || editForm.rate_both_monthly || 0),

        rate_veg_onetime: Number(editForm.rate_veg_onetime || 0),
        rate_veg_lunch_weekly: Number(editForm.rate_veg_lunch_weekly || 0),
        rate_veg_lunch_monthly: Number(editForm.rate_veg_lunch_monthly || 0),
        rate_veg_dinner_weekly: Number(editForm.rate_veg_dinner_weekly || 0),
        rate_veg_dinner_monthly: Number(editForm.rate_veg_dinner_monthly || 0),
        rate_veg_both_weekly: Number(editForm.rate_veg_both_weekly || 0),
        rate_veg_both_monthly: Number(editForm.rate_veg_both_monthly || 0),

        rate_nonveg_onetime: Number(editForm.rate_nonveg_onetime || 0),
        rate_nonveg_lunch_weekly: Number(editForm.rate_nonveg_lunch_weekly || 0),
        rate_nonveg_lunch_monthly: Number(editForm.rate_nonveg_lunch_monthly || 0),
        rate_nonveg_dinner_weekly: Number(editForm.rate_nonveg_dinner_weekly || 0),
        rate_nonveg_dinner_monthly: Number(editForm.rate_nonveg_dinner_monthly || 0),
        rate_nonveg_both_weekly: Number(editForm.rate_nonveg_both_weekly || 0),
        rate_nonveg_both_monthly: Number(editForm.rate_nonveg_both_monthly || 0),

        addons: editForm.addons,
        updated_at: Timestamp.now()
      };

      if (editForm.lat && editForm.lng) {
        updatedFields.location = {
          lat: Number(editForm.lat),
          lng: Number(editForm.lng),
          updated_at: Date.now()
        };
      }

      await updateDoc(doc(db, 'users', vendor.id), updatedFields);
      setVendor(prev => prev ? ({ ...prev, ...updatedFields }) : null);
      addToast('Kitchen settings & rates saved successfully', 'success');
    } catch (err) {
      console.error(err);
      addToast('Failed to save kitchen settings', 'error');
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
        <AlertCircle className="w-12 h-12 text-rose-400 mb-2" />
        <h3 className="font-bold text-lg">Vendor Profile Unavailable</h3>
        <button onClick={() => router.push('/admin/vendors')} className="btn btn-secondary mt-4">
          Back to list
        </button>
      </div>
    );
  }

  const isSuspended = (vendor as any).is_suspended === true;

  const TABS: { key: ActiveTab; label: string; icon: any }[] = [
    { key: 'overview', label: 'Overview & Stats', icon: BarChart3 },
    { key: 'menu', label: 'Live Menu Manager', icon: UtensilsCrossed },
    { key: 'pricing', label: 'Rates & Add-Ons', icon: DollarSign },
    { key: 'subscribers', label: `Active Subscribers (${subscriptions.length})`, icon: Users },
    { key: 'orders', label: `Orders (${history.length})`, icon: Package },
    { key: 'settings', label: 'Settings & Payouts', icon: Sliders },
  ];

  return (
    <div className="space-y-6 animate-fade-in pb-16 pr-4 pl-4 max-w-7xl mx-auto">
      {/* Top Header Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button 
          onClick={() => router.push('/admin/vendors')}
          className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors self-start"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Vendors List
        </button>
        
        {/* Quick Operations Actions */}
        <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">
          {/* Customer View Preview Link */}
          <Link
            href={`/vendor/detail?vendorId=${vendor.id}`}
            target="_blank"
            className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-2xl text-xs font-black uppercase tracking-wider shadow-sm transition-colors flex items-center gap-1.5"
            title="Preview kitchen on customer app"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Customer View
          </Link>

          {/* Suspend / Approve */}
          {isSuspended ? (
            <button
              onClick={() => handleSuspension(false)}
              disabled={actionLoading}
              className="px-3.5 py-2 bg-emerald-500 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-sm hover:bg-emerald-600 transition-colors flex items-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Unsuspend
            </button>
          ) : !vendor.is_approved ? (
            <button
              onClick={() => handleApproval(true)}
              disabled={actionLoading}
              className="px-3.5 py-2 bg-emerald-500 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-sm hover:bg-emerald-600 transition-colors flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" /> Approve
            </button>
          ) : (
            <button
              onClick={() => handleSuspension(true)}
              disabled={actionLoading}
              className="px-3.5 py-2 bg-rose-500 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-sm hover:bg-rose-600 transition-colors flex items-center gap-1.5"
            >
              <ShieldAlert className="w-3.5 h-3.5" /> Suspend
            </button>
          )}
        </div>
      </div>

      {/* Kitchen Identity Banner */}
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-card flex flex-col md:flex-row gap-6 items-start md:items-center">
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="w-24 h-24 rounded-3xl bg-slate-50 relative overflow-hidden flex-shrink-0 shadow-inner flex items-center justify-center border border-slate-100 cursor-pointer group"
          title="Click to change kitchen image"
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
            <Store className="w-10 h-10 text-slate-300" />
          )}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white">
            <UploadCloud className="w-5 h-5 mb-0.5" />
            <span className="text-[8px] font-black uppercase tracking-widest text-center">Change</span>
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

        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-extrabold text-slate-900">{vendor.kitchen_name || `${vendor.name}'s Kitchen`}</h1>
            
            {/* Status Badges */}
            {isSuspended ? (
              <span className="text-[10px] font-bold text-rose-500 bg-rose-50 px-2.5 py-1 rounded-xl border border-rose-200">Suspended</span>
            ) : vendor.is_approved ? (
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200 flex items-center gap-0.5">Approved & Verified</span>
            ) : (
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200">Pending Review</span>
            )}
          </div>

          <p className="text-sm text-slate-500 font-medium">{vendor.cuisine_type || 'North & South Indian Homestyle Meals'}</p>

          <div className="flex items-center gap-4 text-xs text-slate-500 mt-2 flex-wrap">
            <span className="flex items-center gap-1 font-semibold"><Phone className="w-3.5 h-3.5 text-slate-400" /> {vendor.phone}</span>
            {vendor.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5 text-slate-400" /> {vendor.email}</span>}
            {vendor.address && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-slate-400" /> {vendor.address}</span>}
          </div>
        </div>
      </div>

      {/* Clean Vector Tab Navigation */}
      <div className="flex gap-1.5 p-1.5 bg-slate-100/80 rounded-2xl overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-2 ${
                activeTab === tab.key
                  ? 'bg-white text-brand shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW & STATS */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-card">
              <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
                <DollarSign className="w-4 h-4 text-emerald-500" /> Total Revenue
              </div>
              <div className="text-2xl font-black text-slate-900">₹{stats.totalRevenue.toLocaleString('en-IN')}</div>
              <div className="text-[10px] text-slate-400 mt-1">Processed payments</div>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-card">
              <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
                <Users className="w-4 h-4 text-brand" /> Active Subscribers
              </div>
              <div className="text-2xl font-black text-slate-900">{stats.activeSubscribers}</div>
              <div className="text-[10px] text-slate-400 mt-1">Ongoing monthly & weekly</div>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-card">
              <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
                <ShoppingBag className="w-4 h-4 text-blue-500" /> Total Orders
              </div>
              <div className="text-2xl font-black text-slate-900">{stats.totalOrders}</div>
              <div className="text-[10px] text-emerald-600 font-bold mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> {stats.deliveredOrders} delivered
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-card">
              <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
                <Award className="w-4 h-4 text-amber-500" /> Success Rate
              </div>
              <div className="text-2xl font-black text-slate-900">{stats.deliverySuccessRate}%</div>
              <div className="text-[10px] text-slate-400 mt-1">Punctual fulfilment</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-card space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <UtensilsCrossed className="w-3.5 h-3.5 text-slate-400" /> Dietary & Menu Offering
              </h3>
              <div className="flex flex-wrap gap-2">
                {vendor.dietary_categories?.includes('veg') && (
                  <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold border border-emerald-100 flex items-center gap-1.5">
                    <Leaf className="w-3.5 h-3.5 text-emerald-600" /> Pure Veg Meals
                  </span>
                )}
                {vendor.dietary_categories?.includes('non_veg') && (
                  <span className="px-3 py-1 bg-rose-50 text-rose-700 rounded-xl text-xs font-bold border border-rose-100 flex items-center gap-1.5">
                    <Drumstick className="w-3.5 h-3.5 text-rose-600" /> Non-Veg Meals
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500">
                Active Sweets & Add-ons in catalog: <strong className="text-slate-900 font-bold">{editForm.addons.length} items</strong>
              </div>
              <button 
                onClick={() => setActiveTab('pricing')}
                className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition-colors"
              >
                Modify Rates & Offerings
              </button>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-card space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-slate-400" /> Prep Capacity & Dispatch
              </h3>
              <div className="text-sm font-bold text-slate-900">
                {vendor.capacityUnlimited ? 'Unlimited Tiffins / Day' : `${vendor.capacity || 50} Tiffins / Day Maximum`}
              </div>
              <div className="text-xs text-slate-500">
                Current Active Subscribers: <strong className="text-slate-900 font-bold">{stats.activeSubscribers}</strong>
              </div>
              <button 
                onClick={() => setActiveTab('settings')}
                className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition-colors"
              >
                Adjust Capacity & Address
              </button>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-card space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <UtensilsCrossed className="w-3.5 h-3.5 text-slate-400" /> Daily Menu Status
              </h3>
              <div className="text-sm font-bold text-slate-900">
                {vegItems.length > 0 ? `${vegItems.length} Veg dishes published` : 'No menu published for selected date'}
              </div>
              <div className="text-xs text-slate-500">
                Target Date: <strong className="text-slate-900 font-bold">{menuDate}</strong>
              </div>
              <button 
                onClick={() => setActiveTab('menu')}
                className="w-full py-2 bg-brand/10 hover:bg-brand/20 text-brand rounded-xl text-xs font-bold transition-colors"
              >
                Open Menu Editor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LIVE MENU MANAGER */}
      {activeTab === 'menu' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-card space-y-6 animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <UtensilsCrossed className="w-5 h-5 text-brand" /> Live Daily Menu Manager
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Publish and update today's Pure Veg and Non-Veg menu for this kitchen</p>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={() => setMenuDate(getTodayStr())}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  menuDate === getTodayStr() ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                Today
              </button>
              <input 
                type="date" 
                value={menuDate} 
                onChange={(e) => setMenuDate(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              />
            </div>
          </div>

          {menuLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-brand" />
              <span className="text-xs font-bold">Loading menu for {menuDate}...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Pure Veg Menu Editor */}
              <div className="p-5 bg-emerald-50/40 rounded-3xl border border-emerald-100/80 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                    <Leaf className="w-4 h-4 text-emerald-600" /> Pure Veg Menu ({menuDate})
                  </h4>
                  <span className="text-[10px] font-bold text-emerald-600">{vegItems.length} items</span>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Included Dishes / Items</label>
                  <div className="flex flex-wrap gap-2 min-h-[40px] p-2 bg-white rounded-2xl border border-emerald-100">
                    {vegItems.map((item, idx) => (
                      <span key={idx} className="px-2.5 py-1 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-emerald-100">
                        {item}
                        <button 
                          type="button" 
                          onClick={() => handleRemoveVegItem(idx)}
                          className="text-emerald-400 hover:text-rose-500 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    {vegItems.length === 0 && (
                      <span className="text-xs text-slate-400 italic py-1">No items added yet.</span>
                    )}
                  </div>

                  <div className="flex gap-2 mt-2">
                    <input 
                      type="text" 
                      placeholder="Add dish (e.g. Paneer Butter Masala)..." 
                      value={newVegItemInput} 
                      onChange={(e) => setNewVegItemInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddVegItem(); }}}
                      className="flex-1 px-3 py-2 bg-white border border-emerald-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                    />
                    <button 
                      type="button" 
                      onClick={handleAddVegItem}
                      className="px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Veg Chef Note / Special</label>
                  <input 
                    type="text" 
                    value={vegNote} 
                    onChange={(e) => setVegNote(e.target.value)}
                    placeholder="e.g. Served with hot fluffy rotis and pickle"
                    className="w-full px-3 py-2.5 bg-white border border-emerald-200 rounded-xl text-xs font-medium text-slate-900"
                  />
                </div>
              </div>

              {/* Non-Veg Menu Editor */}
              <div className="p-5 bg-rose-50/40 rounded-3xl border border-rose-100/80 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
                    <Drumstick className="w-4 h-4 text-rose-600" /> Non-Veg Menu ({menuDate})
                  </h4>
                  <span className="text-[10px] font-bold text-rose-600">{nonVegItems.length} items</span>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Included Dishes / Items</label>
                  <div className="flex flex-wrap gap-2 min-h-[40px] p-2 bg-white rounded-2xl border border-rose-100">
                    {nonVegItems.map((item, idx) => (
                      <span key={idx} className="px-2.5 py-1 bg-rose-50 text-rose-800 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-rose-100">
                        {item}
                        <button 
                          type="button" 
                          onClick={() => handleRemoveNonVegItem(idx)}
                          className="text-rose-400 hover:text-rose-600 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    {nonVegItems.length === 0 && (
                      <span className="text-xs text-slate-400 italic py-1">No non-veg items added yet.</span>
                    )}
                  </div>

                  <div className="flex gap-2 mt-2">
                    <input 
                      type="text" 
                      placeholder="Add dish (e.g. Chicken Curry)..." 
                      value={newNonVegItemInput} 
                      onChange={(e) => setNewNonVegItemInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddNonVegItem(); }}}
                      className="flex-1 px-3 py-2 bg-white border border-rose-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-rose-500"
                    />
                    <button 
                      type="button" 
                      onClick={handleAddNonVegItem}
                      className="px-3 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Non-Veg Chef Note / Special</label>
                  <input 
                    type="text" 
                    value={nonVegNote} 
                    onChange={(e) => setNonVegNote(e.target.value)}
                    placeholder="e.g. Made with fresh chicken and aromatic spices"
                    className="w-full px-3 py-2.5 bg-white border border-rose-200 rounded-xl text-xs font-medium text-slate-900"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              onClick={handleSaveMenu}
              disabled={savingMenu}
              className="px-6 py-3 bg-brand text-white font-black text-xs uppercase tracking-wider rounded-2xl hover:bg-brand/90 transition-all flex items-center gap-2 shadow-lg shadow-brand/20"
            >
              {savingMenu ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Publish Menu for {menuDate}
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: RATES & ADD-ONS */}
      {activeTab === 'pricing' && (
        <form onSubmit={handleSaveProfile} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-card space-y-8 animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-brand" /> Rate Cards & Sub-Subscriptions Catalog
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Admin-managed pricing for Pure Veg, Non-Veg, and monthly add-ons</p>
            </div>
            <span className="text-[10px] font-black text-brand bg-brand/10 px-3 py-1 rounded-xl flex items-center gap-1">
              <Sliders className="w-3 h-3 text-brand" /> Admin Algorithm Managed
            </span>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
              Dietary Modes Offered by this Kitchen
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={editForm.dietary_categories.includes('veg')}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...editForm.dietary_categories, 'veg' as DietaryCategory]
                      : editForm.dietary_categories.filter(c => c !== 'veg');
                    if (next.length > 0) setEditForm({ ...editForm, dietary_categories: next });
                  }}
                  className="w-4 h-4 rounded text-brand focus:ring-brand"
                />
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                  <Leaf className="w-3.5 h-3.5 text-emerald-600" /> Pure Veg
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={editForm.dietary_categories.includes('non_veg')}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...editForm.dietary_categories, 'non_veg' as DietaryCategory]
                      : editForm.dietary_categories.filter(c => c !== 'non_veg');
                    if (next.length > 0) setEditForm({ ...editForm, dietary_categories: next });
                  }}
                  className="w-4 h-4 rounded text-brand focus:ring-brand"
                />
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                  <Drumstick className="w-3.5 h-3.5 text-rose-600" /> Non-Veg
                </span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Pure Veg Rate Card */}
            <div className="p-5 bg-emerald-50/40 rounded-3xl border border-emerald-100 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                  <Leaf className="w-4 h-4 text-emerald-600" /> Pure Veg Rate Card
                </h4>
                <span className="text-[10px] font-bold text-emerald-600">INR (₹)</span>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Trial Single Meal Rate (₹)</label>
                <input 
                  type="number" 
                  value={editForm.rate_veg_onetime} 
                  onChange={e => setEditForm({ ...editForm, rate_veg_onetime: e.target.value })}
                  placeholder="e.g. 120"
                  className="w-full bg-white border border-emerald-200 rounded-2xl p-3 text-xs font-bold text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Lunch Weekly (₹)</label>
                  <input 
                    type="number" 
                    value={editForm.rate_veg_lunch_weekly} 
                    onChange={e => setEditForm({ ...editForm, rate_veg_lunch_weekly: e.target.value })}
                    placeholder="e.g. 700"
                    className="w-full bg-white border border-emerald-200 rounded-2xl p-3 text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Lunch Monthly (₹)</label>
                  <input 
                    type="number" 
                    value={editForm.rate_veg_lunch_monthly} 
                    onChange={e => setEditForm({ ...editForm, rate_veg_lunch_monthly: e.target.value })}
                    placeholder="e.g. 2600"
                    className="w-full bg-white border border-emerald-200 rounded-2xl p-3 text-xs font-bold text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Dinner Weekly (₹)</label>
                  <input 
                    type="number" 
                    value={editForm.rate_veg_dinner_weekly} 
                    onChange={e => setEditForm({ ...editForm, rate_veg_dinner_weekly: e.target.value })}
                    placeholder="e.g. 700"
                    className="w-full bg-white border border-emerald-200 rounded-2xl p-3 text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Dinner Monthly (₹)</label>
                  <input 
                    type="number" 
                    value={editForm.rate_veg_dinner_monthly} 
                    onChange={e => setEditForm({ ...editForm, rate_veg_dinner_monthly: e.target.value })}
                    placeholder="e.g. 2600"
                    className="w-full bg-white border border-emerald-200 rounded-2xl p-3 text-xs font-bold text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Combo Weekly (₹)</label>
                  <input 
                    type="number" 
                    value={editForm.rate_veg_both_weekly} 
                    onChange={e => setEditForm({ ...editForm, rate_veg_both_weekly: e.target.value })}
                    placeholder="e.g. 1350"
                    className="w-full bg-white border border-emerald-200 rounded-2xl p-3 text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Combo Monthly (₹)</label>
                  <input 
                    type="number" 
                    value={editForm.rate_veg_both_monthly} 
                    onChange={e => setEditForm({ ...editForm, rate_veg_both_monthly: e.target.value })}
                    placeholder="e.g. 5000"
                    className="w-full bg-white border border-emerald-200 rounded-2xl p-3 text-xs font-bold text-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* Non-Veg Rate Card */}
            <div className={`p-5 bg-rose-50/40 rounded-3xl border border-rose-100 space-y-4 ${
              !editForm.dietary_categories.includes('non_veg') ? 'opacity-50 pointer-events-none' : ''
            }`}>
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
                  <Drumstick className="w-4 h-4 text-rose-600" /> Non-Veg Rate Card
                </h4>
                <span className="text-[10px] font-bold text-rose-600">INR (₹)</span>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Trial Single Meal Rate (₹)</label>
                <input 
                  type="number" 
                  value={editForm.rate_nonveg_onetime} 
                  onChange={e => setEditForm({ ...editForm, rate_nonveg_onetime: e.target.value })}
                  placeholder="e.g. 150"
                  className="w-full bg-white border border-rose-200 rounded-2xl p-3 text-xs font-bold text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Lunch Weekly (₹)</label>
                  <input 
                    type="number" 
                    value={editForm.rate_nonveg_lunch_weekly} 
                    onChange={e => setEditForm({ ...editForm, rate_nonveg_lunch_weekly: e.target.value })}
                    placeholder="e.g. 950"
                    className="w-full bg-white border border-rose-200 rounded-2xl p-3 text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Lunch Monthly (₹)</label>
                  <input 
                    type="number" 
                    value={editForm.rate_nonveg_lunch_monthly} 
                    onChange={e => setEditForm({ ...editForm, rate_nonveg_lunch_monthly: e.target.value })}
                    placeholder="e.g. 3600"
                    className="w-full bg-white border border-rose-200 rounded-2xl p-3 text-xs font-bold text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Dinner Weekly (₹)</label>
                  <input 
                    type="number" 
                    value={editForm.rate_nonveg_dinner_weekly} 
                    onChange={e => setEditForm({ ...editForm, rate_nonveg_dinner_weekly: e.target.value })}
                    placeholder="e.g. 950"
                    className="w-full bg-white border border-rose-200 rounded-2xl p-3 text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Dinner Monthly (₹)</label>
                  <input 
                    type="number" 
                    value={editForm.rate_nonveg_dinner_monthly} 
                    onChange={e => setEditForm({ ...editForm, rate_nonveg_dinner_monthly: e.target.value })}
                    placeholder="e.g. 3600"
                    className="w-full bg-white border border-rose-200 rounded-2xl p-3 text-xs font-bold text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Combo Weekly (₹)</label>
                  <input 
                    type="number" 
                    value={editForm.rate_nonveg_both_weekly} 
                    onChange={e => setEditForm({ ...editForm, rate_nonveg_both_weekly: e.target.value })}
                    placeholder="e.g. 1850"
                    className="w-full bg-white border border-rose-200 rounded-2xl p-3 text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Combo Monthly (₹)</label>
                  <input 
                    type="number" 
                    value={editForm.rate_nonveg_both_monthly} 
                    onChange={e => setEditForm({ ...editForm, rate_nonveg_both_monthly: e.target.value })}
                    placeholder="e.g. 6800"
                    className="w-full bg-white border border-rose-200 rounded-2xl p-3 text-xs font-bold text-slate-900"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 border-t border-slate-100 pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                  <Tag className="w-4 h-4 text-amber-500" /> Sub-Subscription Add-Ons Catalog
                </h4>
                <p className="text-xs text-slate-500">Sweets, curd, extra chapatis, or special sides offered as monthly add-ons</p>
              </div>
              <span className="text-xs font-bold text-slate-400">{editForm.addons.length} items</span>
            </div>

            {editForm.addons.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {editForm.addons.map((addon) => (
                  <div key={addon.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">{addon.name}</span>
                        {addon.active ? (
                          <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">Active</span>
                        ) : (
                          <span className="text-[9px] font-bold text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded">Paused</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        ₹{addon.monthly_price}/mo <span className="text-slate-400 font-normal">(Weekly ~₹{addon.weekly_price})</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleAddonActive(addon.id)}
                        className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-100"
                      >
                        {addon.active ? 'Pause' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveAddon(addon.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
                No add-ons created yet. Add sweets, curd, or extras below.
              </div>
            )}

            <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-100 space-y-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-900">Add New Sub-Subscription / Add-On</span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input 
                  type="text" 
                  placeholder="Add-on Name (e.g. Gulab Jamun (2 pcs))" 
                  value={newAddonName} 
                  onChange={e => setNewAddonName(e.target.value)}
                  className="px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs font-bold text-slate-900"
                />
                <input 
                  type="number" 
                  placeholder="Monthly Price in ₹ (e.g. 300)" 
                  value={newAddonMonthlyPrice} 
                  onChange={e => setNewAddonMonthlyPrice(e.target.value)}
                  className="px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs font-bold text-slate-900"
                />
                <button 
                  type="button" 
                  onClick={handleAddAddon}
                  className="px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-amber-700 flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Add to Catalog
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={actionLoading}
              className="px-8 py-3.5 bg-brand text-white font-black text-xs uppercase tracking-wider rounded-2xl hover:bg-brand/90 transition-all flex items-center gap-2 shadow-lg shadow-brand/25"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save Rates & Add-Ons Catalog
            </button>
          </div>
        </form>
      )}

      {/* TAB 4: SUBSCRIBERS */}
      {activeTab === 'subscribers' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-card space-y-6 animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-brand" /> Active Kitchen Subscribers
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Manage meal schedules, pause, or cancel subscriptions</p>
            </div>
            <span className="text-xs font-black text-slate-600 bg-slate-100 px-3 py-1 rounded-xl">
              Total: {subscriptions.length}
            </span>
          </div>

          {subscriptions.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <Users className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-sm font-bold">No active subscriptions for this kitchen yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {subscriptions.map((sub) => (
                <div key={sub.id} className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">User ID</span>
                      <div className="text-xs font-mono font-bold text-slate-800">{sub.user_id.slice(0, 12)}...</div>
                    </div>
                    <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-lg border ${
                      sub.status === 'active' 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                        : sub.status === 'paused'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      {sub.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">MEAL TYPE</span>
                      <span className="font-bold text-slate-900 uppercase">{sub.meal_type}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">CATEGORY</span>
                      <span className="font-bold text-slate-900 uppercase flex items-center gap-1">
                        {sub.category === 'non_veg' ? <><Drumstick className="w-3.5 h-3.5 text-rose-600" /> Non-Veg</> : <><Leaf className="w-3.5 h-3.5 text-emerald-600" /> Veg</>}
                      </span>
                    </div>
                  </div>

                  {sub.selected_addons && sub.selected_addons.length > 0 && (
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold mb-1">ADD-ONS</span>
                      <div className="flex flex-wrap gap-1">
                        {sub.selected_addons.map((a, i) => (
                          <span key={i} className="text-[10px] bg-white px-2 py-0.5 rounded border border-slate-200 font-semibold text-slate-700">
                            + {a.name} (₹{a.price_paid})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                    <span className="text-xs font-black text-slate-900">
                      Total: ₹{sub.total_price || sub.price || 0}
                    </span>
                    <div className="flex gap-2">
                      {sub.status === 'active' ? (
                        <button
                          onClick={() => handleUpdateSubscriptionStatus(sub.id, 'paused')}
                          disabled={actionLoading}
                          className="px-2.5 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg text-[10px] font-bold border border-amber-200"
                        >
                          Pause
                        </button>
                      ) : (
                        <button
                          onClick={() => handleUpdateSubscriptionStatus(sub.id, 'active')}
                          disabled={actionLoading}
                          className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-[10px] font-bold border border-emerald-200"
                        >
                          Resume
                        </button>
                      )}
                      <button
                        onClick={() => handleUpdateSubscriptionStatus(sub.id, 'cancelled')}
                        disabled={actionLoading}
                        className="px-2.5 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg text-[10px] font-bold border border-rose-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: ORDERS */}
      {activeTab === 'orders' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-card space-y-6 animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-brand" /> Live & Past Orders
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Track prep batches, dispatches, and delivery statuses</p>
            </div>
            <span className="text-xs font-black text-slate-600 bg-slate-100 px-3 py-1 rounded-xl">
              {history.length} Orders
            </span>
          </div>

          {history.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <ShoppingBag className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-sm font-bold">No orders recorded for this kitchen yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((order) => (
                <div key={order.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 font-mono">#{order.id.slice(0, 8)}</span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg border ${
                        order.status === 'delivered' || order.status === 'completed'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : order.status === 'dispatched'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : order.status === 'ready'
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {order.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {order.delivery_address || 'Address on file'} • ₹{order.total_amount || order.amount || 0}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400">STATUS:</span>
                    <select
                      value={order.status}
                      onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value as any)}
                      className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                    >
                      <option value="pending">Pending</option>
                      <option value="cooking">Cooking</option>
                      <option value="ready">Ready for Pickup</option>
                      <option value="dispatched">Dispatched</option>
                      <option value="delivered">Delivered</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 6: KITCHEN SETTINGS & PAYOUTS */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveProfile} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-card space-y-8 animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Sliders className="w-5 h-5 text-brand" /> Kitchen Profile, Coordinates & Bank Payouts
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Manage operational identity, GPS routing coords, and settlement bank accounts</p>
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase">Vendor ID: {vendor.id.slice(0, 8)}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase tracking-wider text-brand flex items-center gap-1.5">
                <Building2 className="w-4 h-4" /> Operational Identity
              </h4>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Kitchen / Brand Name</label>
                <input 
                  type="text" 
                  value={editForm.kitchen_name} 
                  onChange={e => setEditForm({ ...editForm, kitchen_name: e.target.value })}
                  placeholder="e.g. Vicky Mass Homestyle Tiffins"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Contact Person Name</label>
                <input 
                  type="text" 
                  value={editForm.name} 
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Phone Number</label>
                  <input 
                    type="text" 
                    value={editForm.phone} 
                    onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Notification Email</label>
                  <input 
                    type="email" 
                    value={editForm.email} 
                    onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Cuisine / Food Tags</label>
                <input 
                  type="text" 
                  value={editForm.cuisine_type} 
                  onChange={e => setEditForm({ ...editForm, cuisine_type: e.target.value })}
                  placeholder="e.g. North Indian, Maharashtrian, Jain Friendly"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">FSSAI License Number</label>
                <input 
                  type="text" 
                  value={editForm.fssai_license} 
                  onChange={e => setEditForm({ ...editForm, fssai_license: e.target.value })}
                  placeholder="e.g. 11521019000123"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900 font-mono"
                />
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-700">Daily Prep Capacity Limit</label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={editForm.capacityUnlimited}
                      onChange={(e) => setEditForm({ ...editForm, capacityUnlimited: e.target.checked })}
                      className="w-3.5 h-3.5 rounded text-brand focus:ring-brand"
                    />
                    <span className="text-[11px] font-bold text-slate-600">Unlimited</span>
                  </label>
                </div>
                {!editForm.capacityUnlimited && (
                  <input 
                    type="number" 
                    value={editForm.capacity} 
                    onChange={e => setEditForm({ ...editForm, capacity: e.target.value })}
                    placeholder="e.g. 50 tiffins/day"
                    className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-900"
                  />
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase tracking-wider text-brand flex items-center gap-1.5">
                <MapPin className="w-4 h-4" /> Address & GPS Dispatch Coordinates
              </h4>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Physical Kitchen Address</label>
                <textarea 
                  value={editForm.address} 
                  onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-medium text-slate-900 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Latitude</label>
                  <input 
                    type="number" 
                    step="any"
                    value={editForm.lat} 
                    onChange={e => setEditForm({ ...editForm, lat: e.target.value })}
                    placeholder="e.g. 18.5204"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Longitude</label>
                  <input 
                    type="number" 
                    step="any"
                    value={editForm.lng} 
                    onChange={e => setEditForm({ ...editForm, lng: e.target.value })}
                    placeholder="e.g. 73.8567"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="p-4 bg-emerald-50/40 rounded-2xl border border-emerald-100 space-y-3 mt-4">
                <h5 className="text-xs font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-emerald-600" /> Settlement & Payout Details
                </h5>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">UPI ID for Direct Payouts</label>
                  <input 
                    type="text" 
                    value={editForm.upi_id} 
                    onChange={e => setEditForm({ ...editForm, upi_id: e.target.value })}
                    placeholder="e.g. vickymass@okhdfcbank"
                    className="w-full bg-white border border-emerald-200 rounded-xl p-2.5 text-xs font-bold text-slate-900 font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Bank Account Number</label>
                    <input 
                      type="text" 
                      value={editForm.bank_account_number} 
                      onChange={e => setEditForm({ ...editForm, bank_account_number: e.target.value })}
                      placeholder="e.g. 5010049281928"
                      className="w-full bg-white border border-emerald-200 rounded-xl p-2.5 text-xs font-bold text-slate-900 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">IFSC Code</label>
                    <input 
                      type="text" 
                      value={editForm.bank_ifsc} 
                      onChange={e => setEditForm({ ...editForm, bank_ifsc: e.target.value.toUpperCase() })}
                      placeholder="e.g. HDFC0001234"
                      className="w-full bg-white border border-emerald-200 rounded-xl p-2.5 text-xs font-bold text-slate-900 font-mono uppercase"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Beneficiary Account Name</label>
                    <input 
                      type="text" 
                      value={editForm.bank_beneficiary} 
                      onChange={e => setEditForm({ ...editForm, bank_beneficiary: e.target.value })}
                      placeholder="e.g. Vicky Mass Kitchens Pvt Ltd"
                      className="w-full bg-white border border-emerald-200 rounded-xl p-2.5 text-xs font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Platform Fee %</label>
                    <input 
                      type="number" 
                      value={editForm.platform_fee_pct} 
                      onChange={e => setEditForm({ ...editForm, platform_fee_pct: e.target.value })}
                      placeholder="10"
                      className="w-full bg-white border border-emerald-200 rounded-xl p-2.5 text-xs font-bold text-slate-900"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={actionLoading}
              className="px-8 py-3.5 bg-brand text-white font-black text-xs uppercase tracking-wider rounded-2xl hover:bg-brand/90 transition-all flex items-center gap-2 shadow-lg shadow-brand/25"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save All Kitchen Settings
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
