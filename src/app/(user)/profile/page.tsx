'use client';

import { useState, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { updateUser } from '@/lib/queries/users';
import { uploadImage, cloudinaryUrl } from '@/lib/cloudinary';

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const addToast = useUiStore((s) => s.addToast);
  const router = useRouter();
  
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

  function handleLogout() {
    logout(); // Now handles both Zustand clear + Firebase signOut
    router.replace('/login');
    addToast('Signed out successfully', 'info');
  }

  // Format phone for display: +919876543210 → 98765 43210
  function formatPhone(p?: string) {
    if (!p) return '—';
    const digits = p.replace(/\D/g, '').slice(-10);
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }

  const roleLabel: Record<string, string> = {
    user: 'Customer',
    vendor: 'Tiffin Vendor',
    delivery: 'Delivery Agent',
    admin: 'Administrator',
  };

  const menuItems = [
    { icon: '🎫', label: 'Support & Help', href: '/support' },
    { icon: '📦', label: 'My Subscriptions', href: '/orders' },
  ];

  async function handleEnablePush() {
    if (!user) return;
    const { registerPushNotifications } = await import('@/lib/notifications/push');
    await registerPushNotifications(user.id);
    addToast('Requesting notification access...', 'info');
  }

  return (
    <div className="animate-fade-in">
      {/* Profile Header */}
      <div className="flex items-center gap-4 bg-white rounded-3xl p-5 shadow-card mb-5">
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-brand to-brand-600 flex items-center justify-center text-white text-2xl font-bold shadow-md overflow-hidden cursor-pointer group shrink-0"
        >
          {user?.image ? (
            <Image 
              src={cloudinaryUrl(user.image, 150, 150)} 
              alt={user.name || 'Profile'} 
              fill 
              className="object-cover" 
              unoptimized
            />
          ) : (
            <span>{user?.name?.[0]?.toUpperCase() ?? '?'}</span>
          )}
          
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="text-white text-[9px] font-black uppercase tracking-widest text-center leading-tight">Edit</span>
          </div>

          {loadingImage && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
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
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-900">{user?.name}</h2>
          <p className="text-sm text-slate-500 font-medium">+91 {formatPhone(user?.phone)}</p>
          <span className="badge bg-brand-50 text-brand text-xs mt-1">
            {roleLabel[user?.role ?? 'user'] ?? user?.role}
          </span>
        </div>
      </div>

      {/* Menu Items */}
      <div className="bg-white rounded-3xl shadow-card overflow-hidden mb-5">
        {menuItems.map((item, i) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors ${i > 0 ? 'border-t border-slate-100' : ''}`}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="flex-1 text-sm font-semibold text-slate-800">{item.label}</span>
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>
        ))}
        
        {/* Manual Push Trigger */}
        <button
          onClick={handleEnablePush}
          className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors border-t border-slate-100 text-left"
        >
          <span className="text-xl">🔔</span>
          <span className="flex-1 text-sm font-semibold text-slate-800">Enable Notifications</span>
          <span className="text-[10px] font-black text-brand bg-brand/10 px-2 py-0.5 rounded-full uppercase tracking-widest">Setup</span>
        </button>
      </div>

      {/* Logout */}
      <button onClick={handleLogout} className="btn-danger w-full py-3.5 font-semibold">
        🚪 Sign Out
      </button>

      <p className="text-center text-xs text-slate-400 mt-6">Dabzo v2.0 • Smart Meal Subscriptions</p>
    </div>
  );
}
