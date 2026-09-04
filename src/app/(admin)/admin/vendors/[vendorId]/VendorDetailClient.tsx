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
  ArrowLeft, Check, X, ShieldAlert, Award, IndianRupee, Users, 
  ShoppingBag, ShieldCheck, Edit3, Loader2, UploadCloud, MapPin, 
  Settings, Tag, Trash2, Plus, Leaf, Drumstick, UtensilsCrossed,
  ExternalLink, Phone, Mail, CreditCard, Clock, BarChart3,
  Package, Sliders, CheckCircle, CheckCircle2, AlertOctagon, AlertCircle, Store, Building2,
  ChevronRight, Sparkles, TrendingUp, Wallet
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
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-500">
        <AlertCircle className="w-10 h-10 text-rose-400 mb-2" />
        <h3 className="font-bold text-base">Vendor Profile Unavailable</h3>
        <button onClick={() => router.push('/admin/vendors')} className="btn btn-secondary mt-3 text-xs">
          Back to list
        </button>
      </div>
    );
  }

  const isSuspended = (vendor as any).is_suspended === true;

  const TABS: { key: ActiveTab; label: string; icon: any }[] = [
    { key: 'overview', label: 'Overview', icon: BarChart3 },
    { key: 'menu', label: 'Daily Menu', icon: UtensilsCrossed },
    { key: 'pricing', label: 'Rates & Add-Ons', icon: IndianRupee },
    { key: 'subscribers', label: `Subscribers (${subscriptions.length})`, icon: Users },
    { key: 'orders', label: `Orders (${history.length})`, icon: Package },
    { key: 'settings', label: 'Kitchen Settings & Payouts', icon: Sliders },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Top Header Navigation */}
      <div className="flex items-center justify-between gap-3">
        <button 
          onClick={() => router.push('/admin/vendors')}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Kitchens
        </button>
        
        <div className="flex items-center gap-2">
          <Link
            href={`/vendor/detail?vendorId=${vendor.id}`}
            target="_blank"
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" /> Customer View
          </Link>

          {isSuspended ? (
            <button
              onClick={() => handleSuspension(false)}
              disabled={actionLoading}
              className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Unsuspend
            </button>
          ) : !vendor.is_approved ? (
            <button
              onClick={() => handleApproval(true)}
              disabled={actionLoading}
              className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Check className="w-3.5 h-3.5" /> Approve
            </button>
          ) : (
            <button
              onClick={() => handleSuspension(true)}
              disabled={actionLoading}
              className="px-3 py-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              <ShieldAlert className="w-3.5 h-3.5" /> Suspend
            </button>
          )}
        </div>
      </div>

      {/* Kitchen Identity Banner */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="w-16 h-16 rounded-xl bg-slate-100 relative overflow-hidden shrink-0 flex items-center justify-center border border-slate-200 cursor-pointer group"
          title="Change image"
        >
          {editForm.image ? (
            <Image 
              src={getImageUrl(editForm.image)} 
              alt={vendor.kitchen_name || vendor.name} 
              fill 
              className="object-cover" 
              unoptimized
            />
          ) : (
            <Store className="w-8 h-8 text-slate-400" />
          )}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white">
            <UploadCloud className="w-4 h-4" />
          </div>
          {uploadingImage && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-slate-800 animate-spin" />
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

        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:text-xl font-black text-slate-900 truncate">
              {vendor.kitchen_name || `${vendor.name}'s Kitchen`}
            </h1>
            {vendor.kitchen_name && vendor.name && vendor.kitchen_name.toLowerCase() !== vendor.name.toLowerCase() && (
              <span className="text-xs text-slate-500 font-semibold">(Owner: {vendor.name})</span>
            )}
            
            {isSuspended ? (
              <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">Suspended</span>
            ) : vendor.is_approved ? (
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">Verified</span>
            ) : (
              <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">Pending Review</span>
            )}
          </div>

          <p className="text-xs text-slate-500">{vendor.cuisine_type || 'Homestyle Meals'}</p>

          <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-0.5 flex-wrap">
            <span className="flex items-center gap-1 font-medium"><Phone className="w-3 h-3 text-slate-400" /> {vendor.phone}</span>
            {vendor.email && <span className="flex items-center gap-1">• <Mail className="w-3 h-3 text-slate-400" /> {vendor.email}</span>}
            {vendor.address && <span className="flex items-center gap-1">• <MapPin className="w-3 h-3 text-slate-400" /> {vendor.address}</span>}
          </div>
        </div>
      </div>

      {/* Clean Segmented Navigation */}
      <div className="flex gap-1 p-1 bg-slate-200/60 rounded-xl overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === tab.key
                  ? 'bg-white text-slate-900 shadow-xs'
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
        <div className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
              <div className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold mb-1.5">
                <IndianRupee className="w-3.5 h-3.5 text-emerald-600" /> Revenue
              </div>
              <div className="text-xl font-bold text-slate-900">₹{stats.totalRevenue.toLocaleString('en-IN')}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Processed total</div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
              <div className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold mb-1.5">
                <Users className="w-3.5 h-3.5 text-brand" /> Active Subscribers
              </div>
              <div className="text-xl font-bold text-slate-900">{stats.activeSubscribers}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Recurring subscribers</div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
              <div className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold mb-1.5">
                <ShoppingBag className="w-3.5 h-3.5 text-blue-600" /> Total Orders
              </div>
              <div className="text-xl font-bold text-slate-900">{stats.totalOrders}</div>
              <div className="text-[10px] text-emerald-600 font-semibold mt-0.5 flex items-center gap-0.5">
                <CheckCircle2 className="w-3 h-3" /> {stats.deliveredOrders} delivered
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
              <div className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold mb-1.5">
                <Award className="w-3.5 h-3.5 text-amber-600" /> Punctuality
              </div>
              <div className="text-xl font-bold text-slate-900">{stats.deliverySuccessRate}%</div>
              <div className="text-[10px] text-slate-400 mt-0.5">On-time fulfillment</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-2.5">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dietary Offerings</h3>
              <div className="flex flex-wrap gap-1.5">
                {vendor.dietary_categories?.includes('veg') && (
                  <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 rounded-lg text-xs font-medium border border-emerald-100 flex items-center gap-1">
                    <Leaf className="w-3 h-3 text-emerald-600" /> Pure Veg
                  </span>
                )}
                {vendor.dietary_categories?.includes('non_veg') && (
                  <span className="px-2.5 py-1 bg-rose-50 text-rose-800 rounded-lg text-xs font-medium border border-rose-100 flex items-center gap-1">
                    <Drumstick className="w-3 h-3 text-rose-600" /> Non-Veg
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 pt-1">
                Add-ons in catalog: <strong className="text-slate-800">{editForm.addons.length} items</strong>
              </p>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-2.5">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Prep Capacity</h3>
              <div className="text-sm font-semibold text-slate-900">
                {vendor.capacityUnlimited ? 'Unlimited Tiffins / Day' : `${vendor.capacity || 50} Tiffins / Day`}
              </div>
              <p className="text-xs text-slate-500">
                Active Subscribers: <strong className="text-slate-800">{stats.activeSubscribers}</strong>
              </p>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-2.5">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Today's Menu</h3>
              <div className="text-sm font-semibold text-slate-900">
                {vegItems.length > 0 ? `${vegItems.length} dishes published` : 'No menu published'}
              </div>
              <button 
                onClick={() => setActiveTab('menu')}
                className="text-xs font-bold text-brand hover:underline flex items-center gap-1"
              >
                Manage Menu <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LIVE MENU MANAGER */}
      {activeTab === 'menu' && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-5 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Daily Menu Manager</h3>
              <p className="text-xs text-slate-500">Publish and update Vegetarian and Non-Vegetarian daily tiffin menus</p>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={() => setMenuDate(getTodayStr())}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  menuDate === getTodayStr() ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                Today
              </button>
              <input 
                type="date" 
                value={menuDate} 
                onChange={(e) => setMenuDate(e.target.value)}
                className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
              />
            </div>
          </div>

          {menuLoading ? (
            <div className="py-8 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-slate-800" />
              <span className="text-xs">Loading menu for {menuDate}...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Pure Veg Menu Editor */}
              <div className="p-4 bg-slate-50/70 rounded-xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                    <Leaf className="w-3.5 h-3.5 text-emerald-600" /> Pure Veg Menu
                  </h4>
                  <span className="text-[11px] font-semibold text-slate-400">{vegItems.length} items</span>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 bg-white rounded-lg border border-slate-200">
                    {vegItems.map((item, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-emerald-50 text-emerald-900 rounded-md text-xs font-medium flex items-center gap-1 border border-emerald-100">
                        {item}
                        <button 
                          type="button" 
                          onClick={() => handleRemoveVegItem(idx)}
                          className="text-slate-400 hover:text-rose-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    {vegItems.length === 0 && (
                      <span className="text-xs text-slate-400 italic py-0.5">No items added yet.</span>
                    )}
                  </div>

                  <div className="flex gap-1.5">
                    <input 
                      type="text" 
                      placeholder="Add dish (e.g. Paneer Butter Masala)..." 
                      value={newVegItemInput} 
                      onChange={(e) => setNewVegItemInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddVegItem(); }}}
                      className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:border-slate-800"
                    />
                    <button 
                      type="button" 
                      onClick={handleAddVegItem}
                      className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Chef Note</label>
                  <input 
                    type="text" 
                    value={vegNote} 
                    onChange={(e) => setVegNote(e.target.value)}
                    placeholder="e.g. Served with 4 rotis, jeera rice & pickle"
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900"
                  />
                </div>
              </div>

              {/* Non-Veg Menu Editor */}
              <div className="p-4 bg-slate-50/70 rounded-xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                    <Drumstick className="w-3.5 h-3.5 text-rose-600" /> Non-Veg Menu
                  </h4>
                  <span className="text-[11px] font-semibold text-slate-400">{nonVegItems.length} items</span>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 bg-white rounded-lg border border-slate-200">
                    {nonVegItems.map((item, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-rose-50 text-rose-900 rounded-md text-xs font-medium flex items-center gap-1 border border-rose-100">
                        {item}
                        <button 
                          type="button" 
                          onClick={() => handleRemoveNonVegItem(idx)}
                          className="text-slate-400 hover:text-rose-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    {nonVegItems.length === 0 && (
                      <span className="text-xs text-slate-400 italic py-0.5">No non-veg items added yet.</span>
                    )}
                  </div>

                  <div className="flex gap-1.5">
                    <input 
                      type="text" 
                      placeholder="Add dish (e.g. Chicken Curry)..." 
                      value={newNonVegItemInput} 
                      onChange={(e) => setNewNonVegItemInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddNonVegItem(); }}}
                      className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:border-slate-800"
                    />
                    <button 
                      type="button" 
                      onClick={handleAddNonVegItem}
                      className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Chef Note</label>
                  <input 
                    type="text" 
                    value={nonVegNote} 
                    onChange={(e) => setNonVegNote(e.target.value)}
                    placeholder="e.g. Made fresh with homestyle spices"
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={handleSaveMenu}
              disabled={savingMenu}
              className="px-5 py-2.5 bg-slate-900 text-white font-semibold text-xs rounded-xl hover:bg-slate-800 transition-all flex items-center gap-1.5 shadow-xs"
            >
              {savingMenu ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Publish Menu ({menuDate})
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: RATES & ADD-ONS (COMPACT & ERGONOMIC) */}
      {activeTab === 'pricing' && (
        <form onSubmit={handleSaveProfile} className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Subscription Rate Cards & Add-Ons</h3>
              <p className="text-xs text-slate-500">Admin-managed pricing for Pure Veg, Non-Veg, and sub-subscription add-ons</p>
            </div>
            <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md">
              Admin Managed
            </span>
          </div>

          {/* Dietary selection */}
          <div className="flex items-center gap-6 p-3 bg-slate-50 rounded-xl border border-slate-200/60">
            <span className="text-xs font-semibold text-slate-700">Kitchen Categories:</span>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-800">
              <input 
                type="checkbox" 
                checked={editForm.dietary_categories.includes('veg')}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...editForm.dietary_categories, 'veg' as DietaryCategory]
                    : editForm.dietary_categories.filter(c => c !== 'veg');
                  if (next.length > 0) setEditForm({ ...editForm, dietary_categories: next });
                }}
                className="w-4 h-4 rounded text-slate-900 border-slate-300 focus:ring-slate-900"
              />
              <Leaf className="w-3.5 h-3.5 text-emerald-600" /> Pure Veg
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-800">
              <input 
                type="checkbox" 
                checked={editForm.dietary_categories.includes('non_veg')}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...editForm.dietary_categories, 'non_veg' as DietaryCategory]
                    : editForm.dietary_categories.filter(c => c !== 'non_veg');
                  if (next.length > 0) setEditForm({ ...editForm, dietary_categories: next });
                }}
                className="w-4 h-4 rounded text-slate-900 border-slate-300 focus:ring-slate-900"
              />
              <Drumstick className="w-3.5 h-3.5 text-rose-600" /> Non-Veg
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Pure Veg Rate Card Table */}
            <div className="p-4 bg-slate-50/60 rounded-xl border border-slate-200/70 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                  <Leaf className="w-3.5 h-3.5 text-emerald-600" /> Pure Veg Rate Card
                </h4>
                <span className="text-[10px] font-semibold text-slate-400">INR (₹)</span>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Trial Single Meal</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">₹</span>
                  <input 
                    type="number" 
                    value={editForm.rate_veg_onetime} 
                    onChange={e => setEditForm({ ...editForm, rate_veg_onetime: e.target.value })}
                    placeholder="120"
                    className="w-full pl-7 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Lunch Weekly</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">₹</span>
                    <input 
                      type="number" 
                      value={editForm.rate_veg_lunch_weekly} 
                      onChange={e => setEditForm({ ...editForm, rate_veg_lunch_weekly: e.target.value })}
                      placeholder="700"
                      className="w-full pl-7 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-800"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Lunch Monthly</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">₹</span>
                    <input 
                      type="number" 
                      value={editForm.rate_veg_lunch_monthly} 
                      onChange={e => setEditForm({ ...editForm, rate_veg_lunch_monthly: e.target.value })}
                      placeholder="2600"
                      className="w-full pl-7 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-800"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Dinner Weekly</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">₹</span>
                    <input 
                      type="number" 
                      value={editForm.rate_veg_dinner_weekly} 
                      onChange={e => setEditForm({ ...editForm, rate_veg_dinner_weekly: e.target.value })}
                      placeholder="700"
                      className="w-full pl-7 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-800"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Dinner Monthly</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">₹</span>
                    <input 
                      type="number" 
                      value={editForm.rate_veg_dinner_monthly} 
                      onChange={e => setEditForm({ ...editForm, rate_veg_dinner_monthly: e.target.value })}
                      placeholder="2600"
                      className="w-full pl-7 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-800"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Combo Weekly</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">₹</span>
                    <input 
                      type="number" 
                      value={editForm.rate_veg_both_weekly} 
                      onChange={e => setEditForm({ ...editForm, rate_veg_both_weekly: e.target.value })}
                      placeholder="1350"
                      className="w-full pl-7 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-800"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Combo Monthly</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">₹</span>
                    <input 
                      type="number" 
                      value={editForm.rate_veg_both_monthly} 
                      onChange={e => setEditForm({ ...editForm, rate_veg_both_monthly: e.target.value })}
                      placeholder="5000"
                      className="w-full pl-7 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-800"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Non-Veg Rate Card Table */}
            <div className={`p-4 bg-slate-50/60 rounded-xl border border-slate-200/70 space-y-3 ${
              !editForm.dietary_categories.includes('non_veg') ? 'opacity-40 pointer-events-none' : ''
            }`}>
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                  <Drumstick className="w-3.5 h-3.5 text-rose-600" /> Non-Veg Rate Card
                </h4>
                <span className="text-[10px] font-semibold text-slate-400">INR (₹)</span>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Trial Single Meal</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">₹</span>
                  <input 
                    type="number" 
                    value={editForm.rate_nonveg_onetime} 
                    onChange={e => setEditForm({ ...editForm, rate_nonveg_onetime: e.target.value })}
                    placeholder="150"
                    className="w-full pl-7 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Lunch Weekly</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">₹</span>
                    <input 
                      type="number" 
                      value={editForm.rate_nonveg_lunch_weekly} 
                      onChange={e => setEditForm({ ...editForm, rate_nonveg_lunch_weekly: e.target.value })}
                      placeholder="950"
                      className="w-full pl-7 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-800"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Lunch Monthly</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">₹</span>
                    <input 
                      type="number" 
                      value={editForm.rate_nonveg_lunch_monthly} 
                      onChange={e => setEditForm({ ...editForm, rate_nonveg_lunch_monthly: e.target.value })}
                      placeholder="3600"
                      className="w-full pl-7 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-800"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Dinner Weekly</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">₹</span>
                    <input 
                      type="number" 
                      value={editForm.rate_nonveg_dinner_weekly} 
                      onChange={e => setEditForm({ ...editForm, rate_nonveg_dinner_weekly: e.target.value })}
                      placeholder="950"
                      className="w-full pl-7 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-800"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Dinner Monthly</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">₹</span>
                    <input 
                      type="number" 
                      value={editForm.rate_nonveg_dinner_monthly} 
                      onChange={e => setEditForm({ ...editForm, rate_nonveg_dinner_monthly: e.target.value })}
                      placeholder="3600"
                      className="w-full pl-7 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-800"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Combo Weekly</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">₹</span>
                    <input 
                      type="number" 
                      value={editForm.rate_nonveg_both_weekly} 
                      onChange={e => setEditForm({ ...editForm, rate_nonveg_both_weekly: e.target.value })}
                      placeholder="1850"
                      className="w-full pl-7 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-800"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Combo Monthly</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">₹</span>
                    <input 
                      type="number" 
                      value={editForm.rate_nonveg_both_monthly} 
                      onChange={e => setEditForm({ ...editForm, rate_nonveg_both_monthly: e.target.value })}
                      placeholder="6800"
                      className="w-full pl-7 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-800"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sub-Subscriptions Catalog */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900">Sub-Subscription Add-Ons Catalog</h4>
                <p className="text-[11px] text-slate-500">Sweets, curd, sides, or extras offered on monthly plans</p>
              </div>
              <span className="text-xs text-slate-400">{editForm.addons.length} items</span>
            </div>

            {editForm.addons.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {editForm.addons.map((addon) => (
                  <div key={addon.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-slate-900 truncate">{addon.name}</span>
                        {addon.active ? (
                          <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">Active</span>
                        ) : (
                          <span className="text-[9px] font-semibold text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">Paused</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        ₹{addon.monthly_price}/mo <span className="text-slate-400">(Weekly ~₹{addon.weekly_price})</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleAddonActive(addon.id)}
                        className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        {addon.active ? 'Pause' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveAddon(addon.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
                No add-ons created yet. Add sweets or sides below.
              </div>
            )}

            <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2">
              <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Add New Add-On</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input 
                  type="text" 
                  placeholder="Add-on Name (e.g. Gulab Jamun)" 
                  value={newAddonName} 
                  onChange={e => setNewAddonName(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900"
                />
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">₹</span>
                  <input 
                    type="number" 
                    placeholder="Monthly (e.g. 300)" 
                    value={newAddonMonthlyPrice} 
                    onChange={e => setNewAddonMonthlyPrice(e.target.value)}
                    className="w-full pl-6 pr-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900"
                  />
                </div>
                <button 
                  type="button" 
                  onClick={handleAddAddon}
                  className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add to Catalog
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-slate-100">
            <button
              type="submit"
              disabled={actionLoading}
              className="px-5 py-2.5 bg-slate-900 text-white font-semibold text-xs rounded-xl hover:bg-slate-800 transition-all flex items-center gap-1.5 shadow-xs"
            >
              {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save Rates & Add-Ons Catalog
            </button>
          </div>
        </form>
      )}

      {/* TAB 4: SUBSCRIBERS */}
      {activeTab === 'subscribers' && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4 animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Active Subscribers</h3>
              <p className="text-xs text-slate-500">Manage meal subscriptions, pause, or cancel schedules</p>
            </div>
            <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
              Total: {subscriptions.length}
            </span>
          </div>

          {subscriptions.length === 0 ? (
            <div className="py-8 text-center text-slate-400 space-y-1">
              <Users className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs font-medium">No active subscribers for this kitchen yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {subscriptions.map((sub) => (
                <div key={sub.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-medium text-slate-400 uppercase">Customer ID</span>
                      <div className="text-xs font-mono font-semibold text-slate-800">{sub.user_id.slice(0, 10)}...</div>
                    </div>
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md border ${
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
                      <span className="text-[10px] text-slate-400 block font-medium">PLAN</span>
                      <span className="font-semibold text-slate-800 uppercase">{sub.meal_type}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">CATEGORY</span>
                      <span className="font-semibold text-slate-800 uppercase flex items-center gap-1">
                        {sub.category === 'non_veg' ? <><Drumstick className="w-3 h-3 text-rose-600" /> Non-Veg</> : <><Leaf className="w-3 h-3 text-emerald-600" /> Veg</>}
                      </span>
                    </div>
                  </div>

                  {sub.selected_addons && sub.selected_addons.length > 0 && (
                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium mb-0.5">ADD-ONS</span>
                      <div className="flex flex-wrap gap-1">
                        {sub.selected_addons.map((a, i) => (
                          <span key={i} className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-700">
                            + {a.name} (₹{a.price_paid})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                    <span className="text-xs font-bold text-slate-900">
                      Total: ₹{sub.total_price || sub.price || 0}
                    </span>
                    <div className="flex gap-1.5">
                      {sub.status === 'active' ? (
                        <button
                          onClick={() => handleUpdateSubscriptionStatus(sub.id, 'paused')}
                          disabled={actionLoading}
                          className="px-2 py-0.5 bg-white text-slate-700 hover:bg-slate-100 rounded text-[10px] font-semibold border border-slate-200"
                        >
                          Pause
                        </button>
                      ) : (
                        <button
                          onClick={() => handleUpdateSubscriptionStatus(sub.id, 'active')}
                          disabled={actionLoading}
                          className="px-2 py-0.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded text-[10px] font-semibold border border-emerald-200"
                        >
                          Resume
                        </button>
                      )}
                      <button
                        onClick={() => handleUpdateSubscriptionStatus(sub.id, 'cancelled')}
                        disabled={actionLoading}
                        className="px-2 py-0.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded text-[10px] font-semibold border border-rose-200"
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
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4 animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Kitchen Orders</h3>
              <p className="text-xs text-slate-500">Track meal batches, dispatch, and delivery statuses</p>
            </div>
            <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
              {history.length} Orders
            </span>
          </div>

          {history.length === 0 ? (
            <div className="py-8 text-center text-slate-400 space-y-1">
              <ShoppingBag className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs font-medium">No orders recorded for this kitchen yet.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {history.map((order, idx) => {
                const rawAddr = (order as any).delivery_address || (order as any).address;
                let addressText = 'Address on file';
                if (typeof rawAddr === 'string' && rawAddr.trim().length > 0) {
                  addressText = rawAddr;
                } else if (typeof rawAddr === 'object' && rawAddr !== null) {
                  addressText = rawAddr.line1 || rawAddr.full_address || rawAddr.street || rawAddr.city || (rawAddr.lat && rawAddr.lng ? `GPS: ${rawAddr.lat.toFixed(4)}, ${rawAddr.lng.toFixed(4)}` : 'Address on file');
                }

                const orderAmount = typeof (order as any).total_amount === 'number'
                  ? (order as any).total_amount
                  : (typeof (order as any).amount === 'number' ? (order as any).amount : Number((order as any).total_amount || (order as any).amount || (order as any).price || 0) || 0);

                const orderId = String(order?.id || `ord-${idx}`);
                const shortId = orderId.slice(0, 8);
                const orderStatus = String(order?.status || 'pending');

                return (
                  <div key={orderId} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 font-mono">#{shortId}</span>
                        <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md border ${
                          orderStatus === 'delivered' || orderStatus === 'completed'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : orderStatus === 'dispatched'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {orderStatus}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {addressText} • ₹{orderAmount}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium text-slate-400">STATUS:</span>
                      <select
                        value={orderStatus}
                        onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value as any)}
                        className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
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
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 6: KITCHEN SETTINGS & PAYOUTS */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveProfile} className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-6 animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Kitchen Settings & Bank Payouts</h3>
              <p className="text-xs text-slate-500">Manage identity, prep limits, dispatch GPS coordinates, and bank accounts</p>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">ID: {vendor.id.slice(0, 8)}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-500" /> Operational Details
              </h4>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Kitchen / Brand Name</label>
                <input 
                  type="text" 
                  value={editForm.kitchen_name} 
                  onChange={e => setEditForm({ ...editForm, kitchen_name: e.target.value })}
                  placeholder="e.g. Vicky Mass Homestyle Tiffins"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Contact Person Name</label>
                <input 
                  type="text" 
                  value={editForm.name} 
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Phone</label>
                  <input 
                    type="text" 
                    value={editForm.phone} 
                    onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Email</label>
                  <input 
                    type="email" 
                    value={editForm.email} 
                    onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Cuisine / Food Tags</label>
                <input 
                  type="text" 
                  value={editForm.cuisine_type} 
                  onChange={e => setEditForm({ ...editForm, cuisine_type: e.target.value })}
                  placeholder="e.g. North Indian, Maharashtrian"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">FSSAI License</label>
                <input 
                  type="text" 
                  value={editForm.fssai_license} 
                  onChange={e => setEditForm({ ...editForm, fssai_license: e.target.value })}
                  placeholder="e.g. 11521019000123"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-mono"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-slate-700">Daily Prep Limit</label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={editForm.capacityUnlimited}
                      onChange={(e) => setEditForm({ ...editForm, capacityUnlimited: e.target.checked })}
                      className="w-3.5 h-3.5 rounded text-slate-900"
                    />
                    <span className="text-[11px] text-slate-600">Unlimited</span>
                  </label>
                </div>
                {!editForm.capacityUnlimited && (
                  <input 
                    type="number" 
                    value={editForm.capacity} 
                    onChange={e => setEditForm({ ...editForm, capacity: e.target.value })}
                    placeholder="50 tiffins/day"
                    className="w-full bg-white border border-slate-200 rounded-md px-2.5 py-1 text-xs text-slate-900"
                  />
                )}
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-500" /> Dispatch Location & Payouts
              </h4>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Kitchen Address</label>
                <textarea 
                  value={editForm.address} 
                  onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-900 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Latitude</label>
                  <input 
                    type="number" 
                    step="any"
                    value={editForm.lat} 
                    onChange={e => setEditForm({ ...editForm, lat: e.target.value })}
                    placeholder="18.5204"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Longitude</label>
                  <input 
                    type="number" 
                    step="any"
                    value={editForm.lng} 
                    onChange={e => setEditForm({ ...editForm, lng: e.target.value })}
                    placeholder="73.8567"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2.5 mt-2">
                <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-slate-500" /> Settlement Bank Details
                </h5>

                <div>
                  <label className="block text-[10px] text-slate-500 font-medium mb-0.5">UPI ID for Direct Settlements</label>
                  <input 
                    type="text" 
                    value={editForm.upi_id} 
                    onChange={e => setEditForm({ ...editForm, upi_id: e.target.value })}
                    placeholder="vickymass@okhdfcbank"
                    className="w-full bg-white border border-slate-200 rounded-md px-2.5 py-1 text-xs text-slate-900 font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-500 font-medium mb-0.5">Bank Account Number</label>
                    <input 
                      type="text" 
                      value={editForm.bank_account_number} 
                      onChange={e => setEditForm({ ...editForm, bank_account_number: e.target.value })}
                      placeholder="5010049281928"
                      className="w-full bg-white border border-slate-200 rounded-md px-2.5 py-1 text-xs text-slate-900 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 font-medium mb-0.5">IFSC Code</label>
                    <input 
                      type="text" 
                      value={editForm.bank_ifsc} 
                      onChange={e => setEditForm({ ...editForm, bank_ifsc: e.target.value.toUpperCase() })}
                      placeholder="HDFC0001234"
                      className="w-full bg-white border border-slate-200 rounded-md px-2.5 py-1 text-xs text-slate-900 font-mono uppercase"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-500 font-medium mb-0.5">Beneficiary Name</label>
                    <input 
                      type="text" 
                      value={editForm.bank_beneficiary} 
                      onChange={e => setEditForm({ ...editForm, bank_beneficiary: e.target.value })}
                      placeholder="Vicky Mass Kitchens"
                      className="w-full bg-white border border-slate-200 rounded-md px-2.5 py-1 text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 font-medium mb-0.5">Platform Fee %</label>
                    <input 
                      type="number" 
                      value={editForm.platform_fee_pct} 
                      onChange={e => setEditForm({ ...editForm, platform_fee_pct: e.target.value })}
                      placeholder="10"
                      className="w-full bg-white border border-slate-200 rounded-md px-2.5 py-1 text-xs text-slate-900"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-slate-100">
            <button
              type="submit"
              disabled={actionLoading}
              className="px-5 py-2.5 bg-slate-900 text-white font-semibold text-xs rounded-xl hover:bg-slate-800 transition-all flex items-center gap-1.5 shadow-xs"
            >
              {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save All Kitchen Settings
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
