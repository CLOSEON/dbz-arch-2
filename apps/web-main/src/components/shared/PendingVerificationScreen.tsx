'use client';

import { useState } from 'react';
import { ShieldAlert, Clock, Send, PhoneCall, CheckCircle2, FileText, Store, Truck, LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { updateUser } from '@/lib/queries/users';
import toast from 'react-hot-toast';

interface PendingVerificationProps {
  role: 'vendor' | 'delivery' | 'user';
}

export function PendingVerificationScreen({ role }: PendingVerificationProps) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);

  const [loading, setLoading] = useState(false);
  const [kitchenName, setKitchenName] = useState(user?.kitchen_name || '');
  const [address, setAddress] = useState(user?.address || '');
  const [fssai, setFssai] = useState(user?.fssai_license || '');
  const [vehicleNumber, setVehicleNumber] = useState(user?.vehicle_number || '');
  const [licenseNumber, setLicenseNumber] = useState(user?.license_number || '');

  const isDetailsRequested = user?.verification_status === 'details_requested';
  const isRejected = user?.is_rejected || user?.verification_status === 'rejected';

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    try {
      const updates: any = {
        verification_status: 'pending',
        updated_at: new Date(),
      };

      if (role === 'vendor') {
        if (kitchenName) updates.kitchen_name = kitchenName;
        if (address) updates.address = address;
        if (fssai) updates.fssai_license = fssai;
      } else if (role === 'delivery') {
        if (vehicleNumber) updates.vehicle_number = vehicleNumber;
        if (licenseNumber) updates.license_number = licenseNumber;
      }

      await updateUser(user.id, updates);
      setUser({ ...user, ...updates });
      toast.success('Updated application details! Under review by Admin. 📩');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update details');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between p-4 md:p-8">
      {/* Top Header */}
      <div className="flex justify-between items-center max-w-lg mx-auto w-full pt-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black shadow-sm">
            {role === 'vendor' ? <Store className="w-5 h-5" /> : <Truck className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="font-extrabold text-base tracking-tight text-slate-900">Dabzzo Partner</h3>
            <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider">{role.toUpperCase()} PORTAL</p>
          </div>
        </div>
        <button
          onClick={() => logout()}
          className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-all text-xs font-bold flex items-center gap-1.5 shadow-xs"
        >
          <LogOut className="w-3.5 h-3.5" /> Logout
        </button>
      </div>

      {/* Main Card Container */}
      <div className="max-w-lg mx-auto w-full my-auto py-6 space-y-6">
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 md:p-8 shadow-xl shadow-slate-200/50 space-y-6">
          {/* Status Icon & Header */}
          <div className="text-center space-y-3">
            <div className="relative inline-block">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-sm border ${
                isRejected 
                  ? 'bg-rose-50 border-rose-200 text-rose-600' 
                  : isDetailsRequested 
                  ? 'bg-amber-50 border-amber-200 text-amber-600' 
                  : 'bg-slate-100 border-slate-200 text-slate-800'
              }`}>
                {isRejected ? (
                  <ShieldAlert className="w-8 h-8" />
                ) : isDetailsRequested ? (
                  <FileText className="w-8 h-8" />
                ) : (
                  <Clock className="w-8 h-8" />
                )}
              </div>
            </div>

            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
                {isRejected 
                  ? 'Application Rejected' 
                  : isDetailsRequested 
                  ? 'Information Requested' 
                  : 'Verification Pending'}
              </h1>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
                {isRejected 
                  ? 'Your partner account could not be approved at this time.' 
                  : isDetailsRequested 
                  ? 'Admin has requested additional details before activating your partner account.' 
                  : 'Your partner registration has been received and is currently under review by our operations team.'}
              </p>
            </div>
          </div>

          {/* Admin Note Banner */}
          {user?.admin_note && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-800 uppercase tracking-wider text-[10px]">
                <FileText className="w-3.5 h-3.5" /> Admin Note
              </div>
              <p className="text-amber-900 font-medium">{user.admin_note}</p>
            </div>
          )}

          {/* Timeline */}
          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-3">
            <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Application Timeline</h4>
            <div className="space-y-2.5">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-slate-800">Phone OTP Verified</p>
                  <p className="text-[10px] text-slate-500">{user?.phone}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black ${
                  isDetailsRequested ? 'bg-amber-500 text-white' : 'bg-slate-900 text-white'
                }`}>
                  2
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">Admin Document Review</p>
                  <p className="text-[10px] text-slate-500">
                    {isDetailsRequested ? 'Action Required: Submit Info Below' : 'Under Review (Usually < 2 hours)'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 opacity-40">
                <div className="w-4 h-4 rounded-full border border-slate-300 flex items-center justify-center text-[9px] font-bold text-slate-400">
                  3
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">Dashboard Unlocked</p>
                  <p className="text-[10px] text-slate-500">Receive SMS notification when live</p>
                </div>
              </div>
            </div>
          </div>

          {/* Update Details Form */}
          {(isDetailsRequested || !user?.kitchen_name) && (
            <form onSubmit={handleUpdate} className="space-y-3.5 border-t border-slate-100 pt-4">
              <h4 className="text-xs font-extrabold text-slate-900">Submit Requested Info</h4>

              {role === 'vendor' ? (
                <>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kitchen Name</label>
                    <input
                      className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                      placeholder="e.g. Grandma Gourmet Kitchen"
                      value={kitchenName}
                      onChange={(e) => setKitchenName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">FSSAI License Number</label>
                    <input
                      className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                      placeholder="14-digit FSSAI License Number"
                      value={fssai}
                      onChange={(e) => setFssai(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kitchen Address</label>
                    <textarea
                      className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 h-16"
                      placeholder="Full kitchen address & landmark"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vehicle Registration Number</label>
                    <input
                      className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                      placeholder="e.g. DL-01-AB-1234"
                      value={vehicleNumber}
                      onChange={(e) => setVehicleNumber(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Driving License Number</label>
                    <input
                      className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                      placeholder="Driving License #"
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-slate-900 text-white font-extrabold rounded-xl text-xs hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" /> {loading ? 'Submitting Details...' : 'Submit Info to Admin'}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Footer Support */}
      <div className="text-center max-w-md mx-auto w-full pb-2 pt-2">
        <p className="text-[11px] text-slate-500 font-medium">Need onboarding assistance?</p>
        <a
          href="tel:+919000000001"
          className="inline-flex items-center gap-1 text-xs font-bold text-slate-900 mt-0.5 hover:underline"
        >
          <PhoneCall className="w-3 h-3" /> Call Dabzzo Operations Hotline
        </a>
      </div>
    </div>
  );
}
