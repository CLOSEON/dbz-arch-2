'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { subscribeToAllDriverLocations, updateDeliveryStatus, reassignDriver } from '@/lib/queries/delivery';
import type { DeliveryOrder, DriverProfile, DeliveryStatus } from '@/types/delivery';
import { 
  Package, Search, Clock, CheckCircle2, User, UserCheck, Key, 
  MapPin, Loader2, ArrowRightLeft, ShieldAlert, X
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminOrdersTrackingPage() {
  const { user, isHydrated } = useAuthStore();
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [driverFilter, setDriverFilter] = useState('all');
  
  // Modals state
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showOTPModal, setShowOTPModal] = useState(false);

  // Load orders for today
  useEffect(() => {
    if (!isHydrated || !user || user.role !== 'admin') return;

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, 'delivery_orders'),
      where('createdAt', '>=', Timestamp.fromDate(start)),
      where('createdAt', '<=', Timestamp.fromDate(end))
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DeliveryOrder));
      setOrders(list.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()));
    });

    return () => unsubscribe();
  }, [isHydrated, user]);

  // Load active drivers
  useEffect(() => {
    if (!isHydrated || !user || user.role !== 'admin') return;
    const unsubscribe = subscribeToAllDriverLocations((driversList) => {
      setDrivers(driversList);
    });
    return () => unsubscribe();
  }, [isHydrated, user]);

  const getDriverName = (driverId: string | null) => {
    if (!driverId) return 'Unassigned';
    const driver = drivers.find(d => d.uid === driverId);
    return driver?.name || 'Unknown Driver';
  };

  const filteredOrders = orders.filter(o => {
    const matchesSearch = o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          o.customerId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          o.vendorId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          getDriverName(o.driverId).toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    const matchesDriver = driverFilter === 'all' || 
                          (driverFilter === 'unassigned' && !o.driverId) ||
                          o.driverId === driverFilter;
    return matchesSearch && matchesStatus && matchesDriver;
  });

  const handleStatusUpdate = async (newStatus: DeliveryStatus) => {
    if (!selectedOrder) return;
    const toastId = toast.loading('Updating status...');
    try {
      await updateDeliveryStatus(selectedOrder.id, newStatus, selectedOrder.driverId);
      toast.success('Status updated successfully', { id: toastId });
      setShowStatusModal(false);
      setSelectedOrder(null);
    } catch (error: any) {
      toast.error(`Error: ${error.message}`, { id: toastId });
    }
  };

  const handleReassign = async (newDriverId: string) => {
    if (!selectedOrder) return;
    const toastId = toast.loading('Reassigning driver...');
    try {
      await reassignDriver(selectedOrder.id, newDriverId);
      toast.success('Driver reassigned successfully', { id: toastId });
      setShowReassignModal(false);
      setSelectedOrder(null);
    } catch (error: any) {
      toast.error(`Error: ${error.message}`, { id: toastId });
    }
  };

  if (!isHydrated) return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto pb-28 md:pb-8">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-brand bg-brand/10 px-3 py-1 rounded-full">
            Logistics Control
          </span>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-tight mt-2.5">
            Order Tracking
          </h1>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search orders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-xs border border-slate-200 rounded-2xl focus:outline-none focus:border-brand/40 bg-white text-slate-900 font-medium placeholder-slate-400 shadow-sm"
            />
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full md:w-auto py-2.5 px-4 text-xs border border-slate-200 rounded-2xl focus:outline-none focus:border-brand/40 bg-white text-slate-900 font-medium shadow-sm appearance-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="preparing">Preparing</option>
              <option value="picked_up">Picked Up</option>
              <option value="out_for_delivery">Out for Delivery</option>
              <option value="delivered">Delivered</option>
              <option value="failed_attempt">Failed Attempt</option>
            </select>
            <select
              value={driverFilter}
              onChange={(e) => setDriverFilter(e.target.value)}
              className="w-full md:w-auto py-2.5 px-4 text-xs border border-slate-200 rounded-2xl focus:outline-none focus:border-brand/40 bg-white text-slate-900 font-medium shadow-sm appearance-none cursor-pointer"
            >
              <option value="all">All Drivers</option>
              <option value="unassigned">Unassigned Only</option>
              {drivers.map(d => (
                <option key={d.uid} value={d.uid}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-400 uppercase font-black text-[9px] tracking-wider border-b border-slate-100">
                <th className="p-4 rounded-tl-xl">Order ID & Item</th>
                <th className="p-4">Customer</th>
                <th className="p-4">Vendor</th>
                <th className="p-4">Assigned Driver</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right rounded-tr-xl">Admin Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 font-medium text-slate-700">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400 text-sm font-bold">
                    <Package className="w-8 h-8 mx-auto text-slate-200 mb-3" />
                    No orders found for today.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4">
                      <p className="font-black text-slate-900">#{order.id.slice(-6).toUpperCase()}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{order.meal.name}</p>
                    </td>
                    <td className="p-4">
                      <p className="font-bold text-slate-800">Cust: {order.customerId.slice(0,6).toUpperCase()}</p>
                      <p className="text-[10px] text-slate-500 max-w-[150px] truncate" title={order.address.line1}>
                        {order.address.line1}
                      </p>
                    </td>
                    <td className="p-4 font-bold text-slate-800">Vend: {order.vendorId.slice(0,6).toUpperCase()}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {order.driverId ? (
                          <UserCheck className="w-4 h-4 text-brand" />
                        ) : (
                          <User className="w-4 h-4 text-slate-300" />
                        )}
                        <span className={order.driverId ? 'text-slate-900 font-black' : 'text-slate-400'}>
                          {getDriverName(order.driverId)}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wide ${
                        order.status === 'delivered' ? 'bg-emerald-100 text-emerald-800' : 
                        order.status === 'out_for_delivery' ? 'bg-blue-100 text-blue-800' :
                        order.status === 'preparing' ? 'bg-amber-100 text-amber-800' :
                        order.status === 'picked_up' ? 'bg-purple-100 text-purple-800' :
                        'bg-slate-100 text-slate-800'
                      }`}>
                        {order.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => { setSelectedOrder(order); setShowOTPModal(true); }}
                          className="p-2 bg-slate-50 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
                          title="View OTP"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { setSelectedOrder(order); setShowReassignModal(true); }}
                          className="p-2 bg-brand/5 text-brand hover:bg-brand/10 rounded-xl transition-colors"
                          title="Reassign Driver"
                        >
                          <ArrowRightLeft className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { setSelectedOrder(order); setShowStatusModal(true); }}
                          className="p-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl transition-colors"
                          title="Override Status"
                        >
                          <ShieldAlert className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reassign Driver Modal */}
      {showReassignModal && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-black text-slate-900">Reassign Driver</h2>
              <button onClick={() => setShowReassignModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Select a new active driver for Order <span className="font-bold text-slate-900">#{selectedOrder.id.slice(-6).toUpperCase()}</span>.
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {drivers.length === 0 ? (
                <p className="text-xs text-center text-slate-400 p-4">No active drivers found.</p>
              ) : (
                drivers.map(driver => (
                  <button
                    key={driver.uid}
                    onClick={() => handleReassign(driver.uid)}
                    className="w-full text-left p-3 rounded-2xl border border-slate-100 hover:border-brand/40 hover:bg-brand/5 transition-all flex items-center justify-between group"
                  >
                    <div>
                      <p className="font-bold text-slate-900 text-sm group-hover:text-brand">{driver.name}</p>
                      <p className="text-[10px] text-slate-400">{driver.phone}</p>
                    </div>
                    {selectedOrder.driverId === driver.uid && (
                      <span className="text-[9px] font-black uppercase text-brand bg-brand/10 px-2 py-0.5 rounded">Current</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Force Status Modal */}
      {showStatusModal && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-black text-rose-600 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5" /> Override Status
              </h2>
              <button onClick={() => setShowStatusModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Force update the status for Order <span className="font-bold text-slate-900">#{selectedOrder.id.slice(-6).toUpperCase()}</span>.
              This action skips standard checks and directly modifies the database.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {['preparing', 'picked_up', 'out_for_delivery', 'delivered'].map((status) => (
                <button
                  key={status}
                  onClick={() => handleStatusUpdate(status as DeliveryStatus)}
                  disabled={selectedOrder.status === status}
                  className={`p-3 rounded-2xl border text-xs font-black uppercase tracking-wider transition-all ${
                    selectedOrder.status === status 
                      ? 'bg-slate-50 border-slate-100 text-slate-400 opacity-50 cursor-not-allowed' 
                      : 'border-slate-200 hover:border-brand text-slate-700 hover:text-brand hover:bg-brand/5'
                  }`}
                >
                  {status.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* View OTP Modal */}
      {showOTPModal && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-8 max-w-xs w-full shadow-2xl text-center space-y-4">
            <button onClick={() => setShowOTPModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
            <div className="w-16 h-16 bg-brand/10 text-brand rounded-full flex items-center justify-center mx-auto mb-2">
              <Key className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-black text-slate-900">Security OTP</h2>
            <p className="text-xs text-slate-500">
              For Order <span className="font-bold text-slate-900">#{selectedOrder.id.slice(-6).toUpperCase()}</span>
            </p>
            <div className="bg-slate-50 rounded-2xl py-4 border border-slate-100">
              <span className="text-4xl font-black tracking-widest text-slate-900 font-mono">
                {selectedOrder.otp || 'NONE'}
              </span>
            </div>
            <button
              onClick={() => setShowOTPModal(false)}
              className="w-full py-3 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-colors mt-4"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
