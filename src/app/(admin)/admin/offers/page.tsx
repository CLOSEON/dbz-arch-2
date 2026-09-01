'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
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
import { getAllUsers } from '@/lib/queries/users';
import { Offer, AppUser, OfferLinkType } from '@/types';
import {
  Sparkles,
  Plus,
  Trash2,
  Edit3,
  ChevronUp,
  ChevronDown,
  Store,
  Calendar,
  Layers,
  Image as ImageIcon,
  UploadCloud,
  Check,
  X,
  Search,
  Loader2,
  Eye,
  EyeOff,
  AlertCircle,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { auth } from '@/lib/firebase';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { triggerHapticImpact, triggerHapticNotification, ImpactStyle, NotificationType } from '@/lib/haptics';
import { motion, AnimatePresence } from 'framer-motion';

export default function AdminOffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [vendors, setVendors] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [allOffers, allUsers] = await Promise.all([
        getAllOffers(),
        getAllUsers(),
      ]);

      setOffers(allOffers);
      setVendors(allUsers.filter((u) => u.role === 'vendor'));
    } catch (err: any) {
      console.error('[AdminOffers] Error loading offers data:', err);
      addToast('Failed to load offers data', 'error');
    } finally {
      setLoading(false);
    }
  }

  // Filtered kitchen list for picker
  const filteredVendors = useMemo(() => {
    if (!kitchenSearchQuery.trim()) return vendors;
    const q = kitchenSearchQuery.toLowerCase();
    return vendors.filter(
      (v) =>
        (v.kitchen_name && v.kitchen_name.toLowerCase().includes(q)) ||
        (v.name && v.name.toLowerCase().includes(q)) ||
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
  }

  // Open Edit Modal
  function handleOpenEditModal(offer: Offer) {
    triggerHapticImpact(ImpactStyle.Light);
    setEditingOffer(offer);
    setFormTitle(offer.title || '');
    setFormLinkType(offer.linkType || 'none');
    setFormKitchenId(offer.linkedKitchenId || '');
    setFormIsActive(offer.isActive !== undefined ? offer.isActive : true);
    setFormSortOrder(offer.sortOrder ?? 1);
    setSelectedFile(null);
    setImagePreviewUrl(offer.imageUrl || '');
    setKitchenSearchQuery('');
    setIsKitchenDropdownOpen(false);
    setIsModalOpen(true);
  }

  // File selection handler
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      validateImageFile(file, 3 * 1024 * 1024);
      setSelectedFile(file);
      const localUrl = URL.createObjectURL(file);
      setImagePreviewUrl(localUrl);
      triggerHapticImpact(ImpactStyle.Light);
    } catch (err: any) {
      addToast(err.message || 'Invalid image selected', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // Form Submit Handler (Create or Edit)
  async function handleSaveOffer(e: React.FormEvent) {
    e.preventDefault();

    if (!formTitle.trim()) {
      addToast('Please enter an offer title', 'warning');
      return;
    }

    if (!editingOffer && !selectedFile && !imagePreviewUrl) {
      addToast('Please select a promotional banner image', 'warning');
      return;
    }

    if (formLinkType === 'kitchen' && !formKitchenId) {
      addToast('Please select a linked kitchen or set link to None', 'warning');
      return;
    }

    setSaving(true);
    try {
      const adminUid = auth.currentUser?.uid || user?.id || 'admin';
      let finalImageUrl = editingOffer?.imageUrl || '';

      if (editingOffer) {
        // 1. Updating existing offer
        if (selectedFile) {
          finalImageUrl = await uploadOfferImage(editingOffer.id, selectedFile);
        }

        await updateOffer(editingOffer.id, {
          title: formTitle.trim(),
          imageUrl: finalImageUrl,
          linkType: formLinkType,
          linkedKitchenId: formLinkType === 'kitchen' ? formKitchenId : null,
          isActive: formIsActive,
          sortOrder: Number(formSortOrder) || 1,
        });

        addToast('Offer updated successfully! ✨', 'success');
        triggerHapticNotification(NotificationType.Success);
      } else {
        // 2. Creating new offer
        const tempId = `temp_${Date.now()}`;
        let uploadedUrl = '';

        if (selectedFile) {
          uploadedUrl = await uploadOfferImage(tempId, selectedFile);
        }

        const newId = await createOffer({
          title: formTitle.trim(),
          imageUrl: uploadedUrl,
          linkType: formLinkType,
          linkedKitchenId: formLinkType === 'kitchen' ? formKitchenId : null,
          isActive: formIsActive,
          sortOrder: Number(formSortOrder) || offers.length + 1,
          createdBy: adminUid,
        });

        // Re-upload to permanent offer ID if needed or keep existing uploaded URL
        if (selectedFile && uploadedUrl) {
          const permanentUrl = await uploadOfferImage(newId, selectedFile);
          await updateOffer(newId, { imageUrl: permanentUrl });
        }

        addToast('Offer created successfully! 🎉', 'success');
        triggerHapticNotification(NotificationType.Success);
      }

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

  // Toggle active status directly from list
  async function handleToggleActive(offer: Offer) {
    const updatedStatus = !offer.isActive;
    triggerHapticImpact(ImpactStyle.Light);

    // Optimistic UI update
    setOffers((prev) =>
      prev.map((o) => (o.id === offer.id ? { ...o, isActive: updatedStatus } : o))
    );

    try {
      await updateOffer(offer.id, { isActive: updatedStatus });
      addToast(
        updatedStatus ? 'Offer is now active in carousel' : 'Offer set to inactive',
        'info'
      );
    } catch (err: any) {
      console.error('[AdminOffers] Toggle status error:', err);
      addToast('Failed to update status', 'error');
      loadData();
    }
  }

  // Move Offer Up or Down
  async function handleMoveOffer(index: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= offers.length) return;

    triggerHapticImpact(ImpactStyle.Light);
    setReordering(true);

    const reordered = [...offers];
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    // Recalculate 1-based sort orders
    const payload = reordered.map((item, idx) => ({
      id: item.id,
      sortOrder: idx + 1,
    }));

    // Optimistic UI update
    setOffers(
      reordered.map((item, idx) => ({
        ...item,
        sortOrder: idx + 1,
      }))
    );

    try {
      await reorderOffers(payload);
      addToast('Carousel order updated 🔄', 'info');
    } catch (err: any) {
      console.error('[AdminOffers] Reorder error:', err);
      addToast('Failed to update order', 'error');
      loadData();
    } finally {
      setReordering(false);
    }
  }

  // Delete Offer confirmation
  function handleDeletePrompt(offer: Offer) {
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Promotional Offer?',
      message: `Are you sure you want to permanently delete "${offer.title}"? This will immediately remove the banner card from user home screens and delete its image from Firebase Storage.`,
      confirmLabel: 'Delete Offer',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
        try {
          // Optimistic UI update
          setOffers((prev) => prev.filter((o) => o.id !== offer.id));
          await deleteOffer(offer.id);
          addToast('Offer deleted successfully 🧹', 'info');
          triggerHapticNotification(NotificationType.Success);
        } catch (err: any) {
          console.error('[AdminOffers] Delete error:', err);
          addToast('Failed to delete offer', 'error');
          loadData();
        }
      },
    });
  }

  const getKitchenName = (kitchenId?: string | null) => {
    if (!kitchenId) return 'None';
    const v = vendors.find((v) => v.id === kitchenId);
    return v ? v.kitchen_name || v.name : `Kitchen (${kitchenId.substring(0, 6)})`;
  };

  const activeCount = offers.filter((o) => o.isActive).length;
  const kitchenLinkedCount = offers.filter((o) => o.linkType === 'kitchen').length;

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-brand/10 text-brand flex items-center justify-center shadow-sm">
              <Sparkles className="w-5 h-5" />
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
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="btn-primary py-3 px-5 flex items-center justify-center gap-2 rounded-2xl shadow-lg shadow-brand/20 active:scale-95 transition-all text-xs font-bold uppercase tracking-wider"
        >
          <Plus className="w-4 h-4" /> Add New Offer
        </button>
      </div>

      {/* KPI Stats Grid */}
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

      {/* Offers Cards List View */}
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
          <div className="bg-white rounded-[2.5rem] p-12 text-center shadow-sm border border-slate-100 flex flex-col items-center">
            <div className="w-16 h-16 rounded-3xl bg-slate-50 text-slate-300 flex items-center justify-center mb-3">
              <Sparkles className="w-8 h-8" />
            </div>
            <h3 className="text-base font-black text-slate-800 tracking-tight mb-1">
              No Offers Found
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mb-5">
              Create your first promotional carousel card to showcase discounts, announcements, or featured kitchens on the user home screen.
            </p>
            <button
              onClick={handleOpenCreateModal}
              className="btn-primary py-2.5 px-5 text-xs font-bold rounded-2xl flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Create Offer
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
                  className={`bg-white rounded-3xl p-4 sm:p-5 shadow-sm border transition-all duration-200 group relative flex flex-col justify-between ${
                    offer.isActive
                      ? 'border-slate-100 hover:border-brand/30 hover:shadow-md'
                      : 'border-slate-200/60 bg-slate-50/40 opacity-75'
                  }`}
                >
                  {/* Top Bar with Thumbnail & Details */}
                  <div className="flex gap-4 items-start">
                    {/* 16:9 Thumbnail Box */}
                    <div className="w-28 sm:w-36 aspect-video shrink-0 rounded-2xl bg-slate-100 overflow-hidden border border-slate-100 relative shadow-inner flex items-center justify-center">
                      {offer.imageUrl ? (
                        <img
                          src={offer.imageUrl}
                          alt={offer.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-slate-300" />
                      )}

                      {/* Position Badge */}
                      <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-lg bg-slate-900/80 backdrop-blur-md text-white text-[10px] font-black tracking-tight">
                        #{index + 1}
                      </div>
                    </div>

                    {/* Title & Metadata */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <h3 className="font-extrabold text-slate-900 text-sm sm:text-base leading-snug line-clamp-2">
                          {offer.title}
                        </h3>
                      </div>

                      {/* Status & Kitchen Link Pills */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-2">
                        {/* Status Toggle Badge */}
                        <button
                          onClick={() => handleToggleActive(offer)}
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-tight transition-all active:scale-95 ${
                            offer.isActive
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              offer.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                            }`}
                          />
                          {offer.isActive ? 'Active' : 'Inactive'}
                        </button>

                        {/* Kitchen link */}
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-tight ${
                            offer.linkType === 'kitchen' && offer.linkedKitchenId
                              ? 'bg-orange-50 text-brand'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          <Store className="w-3 h-3 opacity-60" />
                          {offer.linkType === 'kitchen'
                            ? getKitchenName(offer.linkedKitchenId)
                            : 'No link'}
                        </span>
                      </div>

                      {/* Timestamp */}
                      <p className="text-[10px] text-slate-400 flex items-center gap-1 font-medium">
                        <Calendar className="w-3 h-3 opacity-50" />
                        {offer.createdAt ? formatDate(offer.createdAt) : 'Recently'}
                      </p>
                    </div>
                  </div>

                  {/* Bottom Action Footer */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    {/* Reorder Arrows */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleMoveOffer(index, 'up')}
                        disabled={isFirst || reordering}
                        className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600 flex items-center justify-center transition-all active:scale-95"
                        title="Move Left / Earlier"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleMoveOffer(index, 'down')}
                        disabled={isLast || reordering}
                        className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600 flex items-center justify-center transition-all active:scale-95"
                        title="Move Right / Later"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                      <span className="text-[10px] font-bold text-slate-400 ml-1">
                        Order #{offer.sortOrder ?? index + 1}
                      </span>
                    </div>

                    {/* Edit & Delete Buttons */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenEditModal(offer)}
                        className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-brand/10 hover:text-brand text-slate-600 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
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

      {/* Create / Edit Offer Modal */}
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
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50 p-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 p-6 sm:p-7 relative overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-brand/10 text-brand flex items-center justify-center">
                      <Sparkles className="w-5 h-5" />
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
                            placeholder="Search kitchen by name..."
                            value={kitchenSearchQuery}
                            onChange={(e) => {
                              setKitchenSearchQuery(e.target.value);
                              setIsKitchenDropdownOpen(true);
                            }}
                            onFocus={() => setIsKitchenDropdownOpen(true)}
                            className="input pl-9 pr-3 text-xs font-bold"
                          />
                        </div>

                        {/* Selected kitchen pill */}
                        {formKitchenId && (
                          <div className="mt-2 flex items-center justify-between p-2.5 rounded-2xl bg-orange-50 border border-orange-100 text-xs font-bold text-brand">
                            <span className="flex items-center gap-1.5">
                              <Store className="w-4 h-4" />
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
                          <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-white rounded-2xl shadow-xl border border-slate-100 max-h-48 overflow-y-auto p-1.5 space-y-1">
                            {filteredVendors.length === 0 ? (
                              <p className="p-3 text-center text-xs text-slate-400 font-medium">
                                No kitchens found
                              </p>
                            ) : (
                              filteredVendors.map((v) => {
                                const isSelected = formKitchenId === v.id;
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
                                    <div className="min-w-0">
                                      <p className="truncate font-black">{v.kitchen_name || v.name}</p>
                                      {v.address && (
                                        <p
                                          className={`text-[10px] truncate ${
                                            isSelected ? 'text-white/80' : 'text-slate-400'
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

                  {/* Active Toggle & Sort Order */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    {/* Active Switch */}
                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-black text-slate-900">Active Status</p>
                        <p className="text-[10px] text-slate-400">Show on home</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormIsActive(!formIsActive)}
                        className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                          formIsActive ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                            formIsActive ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Sort Order Input */}
                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-black text-slate-900">Position</p>
                        <p className="text-[10px] text-slate-400">Carousel order</p>
                      </div>
                      <input
                        type="number"
                        min="1"
                        value={formSortOrder}
                        onChange={(e) => setFormSortOrder(Number(e.target.value))}
                        className="w-14 text-center py-1 rounded-xl bg-white border border-slate-200 text-xs font-black"
                      />
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-3 flex gap-3">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setIsModalOpen(false)}
                      className="flex-1 rounded-2xl py-3.5 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-bold transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 btn-primary py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-brand/20"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                        </>
                      ) : editingOffer ? (
                        'Update Offer'
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

      {/* Delete Confirmation Dialog */}
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
