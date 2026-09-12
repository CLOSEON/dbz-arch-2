'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  getAllOffers,
  createOffer,
  updateOffer,
  deleteOffer,
  reorderOffers,
  uploadOfferImage,
  validateImageFile,
  compressBannerImage,
} from '@/lib/offers';
import { getApprovedVendors, getAllUsers } from '@/lib/queries/users';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Offer, AppUser, OfferLinkType } from '@/types';
import {
  BadgePercent,
  Plus,
  Trash2,
  Edit3,
  ChevronUp,
  ChevronDown,
  Store,
  Layers,
  Image as ImageIcon,
  UploadCloud,
  Check,
  X,
  Search,
  Loader2,
  Eye,
  Tag,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { triggerHapticImpact, triggerHapticNotification, ImpactStyle, NotificationType } from '@/lib/haptics';
import { motion, AnimatePresence } from 'framer-motion';

export default function AdminOffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [vendors, setVendors] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formLinkType, setFormLinkType] = useState<OfferLinkType>('none');
  const [formKitchenId, setFormKitchenId] = useState<string>('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formSortOrder, setFormSortOrder] = useState<number>(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>('');
  const [kitchenSearchQuery, setKitchenSearchQuery] = useState('');
  const [isKitchenDropdownOpen, setIsKitchenDropdownOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addToast = useUiStore((s) => s.addToast);
  const user = useAuthStore((s) => s.user);

  // Confirm dialog state
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'danger' | 'primary' | 'warning';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // ─── Fetch Kitchens with Multi-layer Fallback ────────────────────────────────
  const loadVendorsList = useCallback(async () => {
    setVendorsLoading(true);
    try {
      // 1. Direct Firestore query for role == 'vendor'
      const vendorQuery = query(collection(db, 'users'), where('role', '==', 'vendor'));
      const vendorSnap = await getDocs(vendorQuery);
      let list: AppUser[] = vendorSnap.docs.map((d) => ({ id: d.id, ...d.data() } as AppUser));

      // 2. Fallback: if list is empty, query all users and filter
      if (list.length === 0) {
        const allSnap = await getDocs(collection(db, 'users'));
        list = allSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as AppUser))
          .filter((u) => u.role === 'vendor' || (u as any).roles?.vendor || Boolean(u.kitchen_name));
      }

      // 3. Fallback: getApprovedVendors helper
      if (list.length === 0) {
        const approved = await getApprovedVendors();
        list = approved as AppUser[];
      }

      // Deduplicate by ID
      const unique = Array.from(new Map(list.map((v) => [v.id, v])).values());
      setVendors(unique);
    } catch (err) {
      console.warn('[AdminOffers] Error fetching vendors list:', err);
    } finally {
      setVendorsLoading(false);
    }
  }, []);

  // ─── Load Offers Data ───────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const allOffers = await getAllOffers();
      setOffers(allOffers);
    } catch (err: any) {
      console.error('[AdminOffers] Error loading offers data:', err);
      addToast('Failed to load offers data', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadData();
    loadVendorsList();
  }, [loadData, loadVendorsList, user]);

  // Filtered kitchen list for picker
  const filteredVendors = useMemo(() => {
    if (!kitchenSearchQuery.trim()) return vendors;
    const q = kitchenSearchQuery.toLowerCase().trim();
    return vendors.filter(
      (v) =>
        (v.kitchen_name && v.kitchen_name.toLowerCase().includes(q)) ||
        (v.name && v.name.toLowerCase().includes(q)) ||
        (Boolean((v as any).business_name) && String((v as any).business_name).toLowerCase().includes(q)) ||
        (v.address && v.address.toLowerCase().includes(q))
    );
  }, [vendors, kitchenSearchQuery]);

  // Open Create Modal
  function handleOpenCreateModal() {
    triggerHapticImpact(ImpactStyle.Light);
    setEditingOffer(null);
    setFormTitle('');
    setFormLinkType('none');
    setFormKitchenId('');
    setFormIsActive(true);
    setFormSortOrder(offers.length + 1);
    setSelectedFile(null);
    setImagePreviewUrl('');
    setKitchenSearchQuery('');
    setIsKitchenDropdownOpen(false);
    setIsModalOpen(true);
    if (vendors.length === 0) {
      loadVendorsList();
    }
  }

  // Open Edit Modal
  function handleOpenEditModal(offer: Offer) {
    triggerHapticImpact(ImpactStyle.Light);
    setEditingOffer(offer);
    setFormTitle(offer.title || '');
    setFormLinkType(offer.linkType || 'none');
    setFormKitchenId(offer.linkedKitchenId || '');
    setFormIsActive(offer.isActive ?? true);
    setFormSortOrder(offer.sortOrder ?? 1);
    setSelectedFile(null);
    setImagePreviewUrl(offer.imageUrl || '');
    setKitchenSearchQuery('');
    setIsKitchenDropdownOpen(false);
    setIsModalOpen(true);
    if (vendors.length === 0) {
      loadVendorsList();
    }
  }

  // File Upload Handler with Canvas 16:9 Compression
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      validateImageFile(file);
    } catch (err: any) {
      addToast(err.message || 'Invalid image file', 'error');
      triggerHapticNotification(NotificationType.Error);
      return;
    }

    try {
      const compressed = await compressBannerImage(file);
      setSelectedFile(compressed as File);
      setImagePreviewUrl(URL.createObjectURL(compressed));
      triggerHapticImpact(ImpactStyle.Light);
    } catch (err) {
      setSelectedFile(file);
      setImagePreviewUrl(URL.createObjectURL(file));
    }
  }

  // Save / Submit Offer
  async function handleSaveOffer(e: React.FormEvent) {
    e.preventDefault();

    if (!editingOffer && !selectedFile) {
      addToast('Please upload a 16:9 banner image for the offer', 'error');
      triggerHapticNotification(NotificationType.Error);
      return;
    }

    if (!formTitle.trim()) {
      addToast('Please enter an offer title or description', 'error');
      triggerHapticNotification(NotificationType.Error);
      return;
    }

    if (formLinkType === 'kitchen' && !formKitchenId) {
      addToast('Please select a kitchen to link this offer to', 'error');
      triggerHapticNotification(NotificationType.Error);
      return;
    }

    setSaving(true);
    try {
      let finalImageUrl = editingOffer?.imageUrl || '';

      if (editingOffer) {
        if (selectedFile) {
          finalImageUrl = await uploadOfferImage(editingOffer.id, selectedFile);
        }

        await updateOffer(editingOffer.id, {
          title: formTitle.trim(),
          imageUrl: finalImageUrl,
          linkType: formLinkType,
          linkedKitchenId: formLinkType === 'kitchen' ? formKitchenId : null,
          isActive: formIsActive,
          sortOrder: formSortOrder,
        });

        addToast('Offer banner updated successfully!', 'success');
      } else {
        const tempId = `off_${Date.now()}`;
        if (selectedFile) {
          finalImageUrl = await uploadOfferImage(tempId, selectedFile);
        }

        await createOffer({
          title: formTitle.trim(),
          imageUrl: finalImageUrl,
          linkType: formLinkType,
          linkedKitchenId: formLinkType === 'kitchen' ? formKitchenId : null,
          isActive: formIsActive,
          sortOrder: formSortOrder,
          createdBy: user?.id || 'admin',
        });

        addToast('Offer banner created successfully!', 'success');
      }

      triggerHapticNotification(NotificationType.Success);
      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      console.error('[AdminOffers] Save error:', err);
      addToast(err.message || 'Failed to save offer', 'error');
      triggerHapticNotification(NotificationType.Error);
    } finally {
      setSaving(false);
    }
  }

  // Delete Prompt
  function handleDeletePrompt(offer: Offer) {
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Promotional Offer?',
      message: `Are you sure you want to delete "${offer.title}"? This will also remove the banner image from Firebase Storage and remove it from the customer carousel.`,
      confirmLabel: 'Delete Offer',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteOffer(offer.id);
          addToast('Offer deleted successfully', 'success');
          triggerHapticNotification(NotificationType.Success);
          await loadData();
        } catch (err: any) {
          console.error('[AdminOffers] Delete error:', err);
          addToast('Failed to delete offer', 'error');
          triggerHapticNotification(NotificationType.Error);
        }
      },
    });
  }

  // Quick Active Toggle
  async function handleToggleActive(offer: Offer) {
    try {
      const nextState = !offer.isActive;
      await updateOffer(offer.id, { isActive: nextState });
      setOffers((prev) =>
        prev.map((o) => (o.id === offer.id ? { ...o, isActive: nextState } : o))
      );
      addToast(nextState ? 'Offer activated' : 'Offer deactivated', 'success');
      triggerHapticImpact(ImpactStyle.Light);
    } catch (err) {
      addToast('Failed to toggle status', 'error');
    }
  }

  // Reorder Sort Position Up/Down
  async function handleMoveOffer(currentIndex: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= offers.length) return;

    triggerHapticImpact(ImpactStyle.Light);
    const reordered = [...offers];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    setOffers(reordered);
    setReordering(true);

    try {
      await reorderOffers(reordered);
      addToast('Carousel order updated', 'success');
    } catch (err) {
      addToast('Failed to save new order', 'error');
      await loadData();
    } finally {
      setReordering(false);
    }
  }

  const getKitchenName = (kitchenId?: string | null) => {
    if (!kitchenId) return 'No Kitchen';
    const found = vendors.find((v) => v.id === kitchenId);
    return found?.kitchen_name || found?.name || (found as any)?.business_name || found?.id || 'Selected Kitchen';
  };

  const activeCount = offers.filter((o) => o.isActive).length;
  const kitchenLinkedCount = offers.filter((o) => o.linkType === 'kitchen').length;

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      {/* ════════════════════════════════════════
          TOP HEADER — Clean Minimalist Brand Accent
      ════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-orange-50 border border-orange-200/60 text-brand flex items-center justify-center shadow-xs">
            <BadgePercent className="w-5 h-5 text-brand stroke-[2]" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Promotional Offers
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Manage home screen banner carousels, promos & kitchen deep-links
            </p>
          </div>
        </div>

        {/* Top Add Button — Only shown when existing offers are present */}
        {offers.length > 0 && (
          <button
            onClick={handleOpenCreateModal}
            className="btn-primary py-3 px-5 flex items-center justify-center gap-2 rounded-2xl shadow-lg shadow-brand/20 active:scale-95 transition-all text-xs font-bold uppercase tracking-wider"
          >
            <Plus className="w-4 h-4" /> Add New Offer
          </button>
        )}
      </div>

      {/* ════════════════════════════════════════
          KPI STATS GRID
      ════════════════════════════════════════ */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-3xl shadow-sm border border-slate-100/80">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
            Total Offers
          </p>
          <div className="flex items-center justify-between">
            <h3 className="text-xl sm:text-2xl font-black text-slate-900">
              {loading ? '—' : offers.length}
            </h3>
            <Layers className="w-5 h-5 text-slate-300" />
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-3xl shadow-sm border border-slate-100/80">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
            Active Banners
          </p>
          <div className="flex items-center justify-between">
            <h3 className="text-xl sm:text-2xl font-black text-emerald-600">
              {loading ? '—' : activeCount}
            </h3>
            <Eye className="w-5 h-5 text-emerald-500/30" />
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-3xl shadow-sm border border-slate-100/80">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
            Linked Kitchens
          </p>
          <div className="flex items-center justify-between">
            <h3 className="text-xl sm:text-2xl font-black text-brand">
              {loading ? '—' : kitchenLinkedCount}
            </h3>
            <Store className="w-5 h-5 text-brand/20" />
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════
          OFFERS LIST & EMPTY STATE
      ════════════════════════════════════════ */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">
            Carousel Cards (Ordered Left-to-Right)
          </h2>
          {reordering && (
            <span className="text-[10px] font-bold text-brand flex items-center gap-1.5 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" /> Saving order...
            </span>
          )}
        </div>

        {loading ? (
          <div className="grid md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-44 bg-white rounded-3xl animate-pulse shadow-sm border border-slate-100"
              />
            ))}
          </div>
        ) : offers.length === 0 ? (
          /* Clean Professional Empty State */
          <div className="bg-white rounded-[2.5rem] p-10 sm:p-14 text-center shadow-sm border border-slate-100 flex flex-col items-center">
            {/* Clean Badge Container */}
            <div className="w-16 h-16 rounded-3xl bg-orange-50 border border-orange-100 flex items-center justify-center text-brand mb-4 shadow-xs">
              <BadgePercent className="w-8 h-8 text-brand stroke-[1.8]" />
            </div>

            <h3 className="text-xl font-black text-slate-900 tracking-tight mb-2">
              No Promotional Offers Yet
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 max-w-md mb-6 leading-relaxed font-medium">
              Create your first promotional carousel banner to showcase discounts, featured kitchens, or special announcements directly on the customer home screen.
            </p>

            {/* Single Primary Action Button */}
            <button
              onClick={handleOpenCreateModal}
              className="btn-primary py-3.5 px-7 text-xs font-bold rounded-2xl flex items-center gap-2 shadow-xl shadow-brand/20 active:scale-95 transition-all uppercase tracking-wider"
            >
              <Plus className="w-4 h-4" /> Create First Offer
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {offers.map((offer, index) => {
              const isFirst = index === 0;
              const isLast = index === offers.length - 1;

              return (
                <div
                  key={offer.id}
                  className="bg-white rounded-3xl border border-slate-100/90 shadow-sm overflow-hidden flex flex-col justify-between transition-all duration-200 hover:shadow-md hover:border-slate-200"
                >
                  {/* Banner Card Preview (16:9) */}
                  <div className="relative aspect-[16/9] w-full bg-slate-900 overflow-hidden group">
                    {offer.imageUrl ? (
                      <img
                        src={offer.imageUrl}
                        alt={offer.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-4 bg-slate-100">
                        <ImageIcon className="w-8 h-8 mb-1" />
                        <span className="text-xs font-bold">No Image Uploaded</span>
                      </div>
                    )}

                    {/* Active/Inactive Badge */}
                    <div className="absolute top-3 left-3 flex items-center gap-1.5">
                      <button
                        onClick={() => handleToggleActive(offer)}
                        className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider backdrop-blur-md transition-all shadow-sm flex items-center gap-1.5 ${
                          offer.isActive
                            ? 'bg-emerald-500/90 text-white hover:bg-emerald-600'
                            : 'bg-slate-900/80 text-slate-300 hover:bg-slate-900'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            offer.isActive ? 'bg-white animate-pulse' : 'bg-slate-400'
                          }`}
                        />
                        {offer.isActive ? 'Active on Home' : 'Inactive'}
                      </button>
                    </div>

                    {/* Linked Kitchen Badge */}
                    <div className="absolute top-3 right-3">
                      {offer.linkType === 'kitchen' && offer.linkedKitchenId ? (
                        <div className="px-2.5 py-1.5 rounded-full bg-slate-950/80 text-white backdrop-blur-md text-[10px] font-bold flex items-center gap-1.5 shadow-sm border border-white/10">
                          <Store className="w-3 h-3 text-amber-300" />
                          <span className="max-w-[120px] truncate">
                            {getKitchenName(offer.linkedKitchenId)}
                          </span>
                        </div>
                      ) : (
                        <div className="px-2.5 py-1.5 rounded-full bg-slate-950/60 text-slate-300 backdrop-blur-md text-[10px] font-bold">
                          No Link
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Bottom Details & Controls */}
                  <div className="p-4 sm:p-5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="font-black text-slate-900 text-sm sm:text-base truncate">
                        {offer.title || 'Untitled Offer'}
                      </h4>
                      <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                        Created {formatDate(offer.createdAt)}
                      </p>
                    </div>

                    {/* Order Controls */}
                    <div className="flex items-center gap-1 shrink-0 bg-slate-50 p-1 rounded-2xl border border-slate-100">
                      <button
                        onClick={() => handleMoveOffer(index, 'up')}
                        disabled={isFirst || reordering}
                        className="w-8 h-8 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 flex items-center justify-center transition-all shadow-2xs active:scale-95"
                        title="Move Left / Earlier"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleMoveOffer(index, 'down')}
                        disabled={isLast || reordering}
                        className="w-8 h-8 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 flex items-center justify-center transition-all shadow-2xs active:scale-95"
                        title="Move Right / Later"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Edit & Delete Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleOpenEditModal(offer)}
                        className="px-3 py-2 rounded-xl bg-slate-50 hover:bg-brand/10 hover:text-brand text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => handleDeletePrompt(offer)}
                        className="w-8 h-8 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-500 flex items-center justify-center transition-all active:scale-95"
                        title="Delete Offer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════
          CREATE / EDIT OFFER MODAL
      ════════════════════════════════════════ */}
      <AnimatePresence>
        {isModalOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !saving && setIsModalOpen(false)}
              className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm"
            />

            {/* Modal Dialog */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 260 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50 p-4 max-h-[92vh] overflow-y-auto"
            >
              <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 p-6 sm:p-7 relative overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-orange-50 border border-orange-200/60 text-brand flex items-center justify-center shadow-xs">
                      <BadgePercent className="w-5 h-5 text-brand stroke-[2]" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900 tracking-tight">
                        {editingOffer ? 'Edit Offer Banner' : 'Create Offer Banner'}
                      </h3>
                      <p className="text-xs text-slate-400 font-medium">
                        Promotional card for user home carousel
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => !saving && setIsModalOpen(false)}
                    className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSaveOffer} className="space-y-4">
                  {/* Banner Image Upload Box */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                        Banner Image (16:9 Ratio, Max 3MB)
                      </label>
                      {imagePreviewUrl && (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="text-[10px] font-bold text-brand hover:underline"
                        >
                          Change Photo
                        </button>
                      )}
                    </div>

                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleFileChange}
                      className="hidden"
                    />

                    {imagePreviewUrl ? (
                      <div className="w-full aspect-video rounded-2xl bg-slate-100 overflow-hidden border border-slate-200 relative group">
                        <img
                          src={imagePreviewUrl}
                          alt="Banner Preview"
                          className="w-full h-full object-cover"
                        />
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white cursor-pointer"
                        >
                          <UploadCloud className="w-6 h-6 mb-1" />
                          <span className="text-xs font-bold">Click to replace banner</span>
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full aspect-video rounded-2xl border-2 border-dashed border-slate-200 hover:border-brand/40 bg-slate-50/70 hover:bg-brand/5 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all p-4 text-center group"
                      >
                        <div className="w-10 h-10 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-brand transition-colors">
                          <UploadCloud className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-700 group-hover:text-brand transition-colors">
                            Click or drag banner image here
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                            Supports JPG, PNG, WebP • Auto-compressed for 16:9 carousel
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Title Field */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                      Offer Title / Alt Label
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 50% Off First Month - Desi Tadka"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      className="input font-bold"
                      required
                    />
                  </div>

                  {/* Kitchen Link Picker */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                      Link Target
                    </label>

                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFormLinkType('none');
                          setFormKitchenId('');
                          setIsKitchenDropdownOpen(false);
                        }}
                        className={`py-2.5 px-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                          formLinkType === 'none'
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <X className="w-3.5 h-3.5" /> No Link
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setFormLinkType('kitchen');
                          setIsKitchenDropdownOpen(true);
                          if (vendors.length === 0) {
                            loadVendorsList();
                          }
                        }}
                        className={`py-2.5 px-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                          formLinkType === 'kitchen'
                            ? 'bg-brand text-white shadow-sm shadow-brand/20'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <Store className="w-3.5 h-3.5" /> Link Kitchen
                      </button>
                    </div>

                    {/* Searchable Kitchen Dropdown (when linkType == kitchen) */}
                    {formLinkType === 'kitchen' && (
                      <div className="relative mt-2">
                        <div className="relative">
                          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Search kitchen by name or address..."
                            value={kitchenSearchQuery}
                            onChange={(e) => {
                              setKitchenSearchQuery(e.target.value);
                              setIsKitchenDropdownOpen(true);
                            }}
                            onFocus={() => {
                              setIsKitchenDropdownOpen(true);
                              if (vendors.length === 0) loadVendorsList();
                            }}
                            className="input pl-9 pr-3 text-xs font-bold"
                          />
                        </div>

                        {/* Selected kitchen pill */}
                        {formKitchenId && (
                          <div className="mt-2 flex items-center justify-between p-2.5 rounded-2xl bg-orange-50 border border-orange-100 text-xs font-bold text-brand">
                            <span className="flex items-center gap-1.5 truncate">
                              <Store className="w-4 h-4 shrink-0" />
                              Selected: {getKitchenName(formKitchenId)}
                            </span>
                            <button
                              type="button"
                              onClick={() => setFormKitchenId('')}
                              className="text-slate-400 hover:text-slate-600 p-0.5"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {/* Dropdown list */}
                        {isKitchenDropdownOpen && (
                          <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-white rounded-2xl shadow-xl border border-slate-100 max-h-52 overflow-y-auto p-1.5 space-y-1">
                            {vendorsLoading ? (
                              <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2 font-medium">
                                <Loader2 className="w-4 h-4 animate-spin text-brand" />
                                Loading registered kitchens...
                              </div>
                            ) : filteredVendors.length === 0 ? (
                              <div className="p-3 text-center">
                                <p className="text-xs text-slate-400 font-medium">
                                  No kitchens found matching &quot;{kitchenSearchQuery}&quot;
                                </p>
                                <button
                                  type="button"
                                  onClick={() => loadVendorsList()}
                                  className="mt-1 text-[11px] font-bold text-brand hover:underline"
                                >
                                  Retry loading kitchens
                                </button>
                              </div>
                            ) : (
                              filteredVendors.map((v) => {
                                const isSelected = formKitchenId === v.id;
                                const displayName = v.kitchen_name || v.name || (v as any).business_name || 'Kitchen';
                                return (
                                  <div
                                    key={v.id}
                                    onClick={() => {
                                      setFormKitchenId(v.id);
                                      setIsKitchenDropdownOpen(false);
                                      setKitchenSearchQuery('');
                                    }}
                                    className={`p-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center justify-between ${
                                      isSelected
                                        ? 'bg-brand text-white'
                                        : 'hover:bg-slate-50 text-slate-700'
                                    }`}
                                  >
                                    <div className="min-w-0 pr-2">
                                      <p className="truncate font-black">{displayName}</p>
                                      {v.name && v.kitchen_name && v.name !== v.kitchen_name && (
                                        <p
                                          className={`text-[10px] truncate ${
                                            isSelected ? 'text-white/80' : 'text-slate-400'
                                          }`}
                                        >
                                          Partner: {v.name}
                                        </p>
                                      )}
                                      {v.address && (
                                        <p
                                          className={`text-[10px] truncate ${
                                            isSelected ? 'text-white/70' : 'text-slate-400'
                                          }`}
                                        >
                                          {v.address}
                                        </p>
                                      )}
                                    </div>
                                    {isSelected && <Check className="w-4 h-4 shrink-0" />}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Active Toggle & Sort Position */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                      <div>
                        <p className="text-xs font-bold text-slate-800">Show on Home</p>
                        <p className="text-[10px] text-slate-400 font-medium">Visible to users</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormIsActive(!formIsActive)}
                        className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                          formIsActive ? 'bg-brand' : 'bg-slate-300'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full bg-white transition-transform shadow-xs ${
                            formIsActive ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-slate-800">Carousel Order</p>
                        <p className="text-[10px] text-slate-400 font-medium">Sort sequence</p>
                      </div>
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={formSortOrder}
                        onChange={(e) => setFormSortOrder(parseInt(e.target.value) || 1)}
                        className="w-12 text-center text-xs font-black p-1.5 rounded-xl border border-slate-200 bg-white"
                      />
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div className="pt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => !saving && setIsModalOpen(false)}
                      className="flex-1 py-3 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 btn-primary py-3 px-4 rounded-2xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-brand/20 disabled:opacity-50"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                        </>
                      ) : editingOffer ? (
                        'Save Changes'
                      ) : (
                        'Create Offer'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Confirm Action Dialog */}
      <ConfirmDialog
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmLabel={confirmConfig.confirmLabel}
        variant={confirmConfig.variant}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
