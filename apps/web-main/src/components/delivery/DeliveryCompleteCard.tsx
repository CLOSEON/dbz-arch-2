'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { CheckCircle2, MapPin, Clock, ExternalLink, ChefHat } from 'lucide-react';

interface DeliveryCompleteCardProps {
  order: any;
  vendorName?: string;
}

function resolveDeliveredAt(deliveredAt: any): Date | null {
  if (!deliveredAt) return null;
  if (deliveredAt instanceof Date) return deliveredAt;
  if (typeof deliveredAt === 'object' && 'seconds' in deliveredAt) {
    return new Date(deliveredAt.seconds * 1000);
  }
  if (typeof deliveredAt === 'string' || typeof deliveredAt === 'number') {
    const d = new Date(deliveredAt);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatDeliveryDateShort(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatDeliveryTime(date: Date): string {
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function DeliveryCompleteCard({ order, vendorName }: DeliveryCompleteCardProps) {
  const deliveredAt = resolveDeliveredAt(
    order.deliveredAt || order.delivered_at || order.timestamps?.deliveredAt
  );

  const mealType = (order.meal?.type || order.meal_type || '').toString();
  const mealName = order.meal?.name && order.meal.name !== 'Tiffin'
    ? order.meal.name
    : mealType
      ? `${mealType.charAt(0).toUpperCase() + mealType.slice(1)} Tiffin`
      : 'Tiffin';
  const addressLine = order.address?.line1 || order.delivery_address?.line1;

  return (
    <motion.div
      initial={{ scale: 0.94, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', bounce: 0.25, duration: 0.5 }}
      className="bg-white rounded-[28px] border border-slate-100 shadow-[0_2px_16px_rgba(15,23,42,0.05)] overflow-hidden"
    >
      {/* Status Hero */}
      <div className="bg-gradient-to-br from-emerald-500 via-emerald-500 to-teal-600 px-6 py-7 text-white relative overflow-hidden">
        {/* Decorative rings */}
        <div className="absolute inset-0 opacity-[0.06] pointer-events-none">
          <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full border-2 border-white" />
          <div className="absolute -right-4 -top-4 w-28 h-28 rounded-full border border-white" />
          <div className="absolute -left-8 -bottom-8 w-32 h-32 rounded-full border-2 border-white" />
        </div>

        <div className="relative z-10 flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6 text-white" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-emerald-100/80">
              Delivery Complete
            </p>
            <p className="text-2xl font-black leading-tight mt-0.5">DELIVERED</p>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="px-6 py-5 space-y-4">
        {/* Meal & Kitchen */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5">
            <span className="text-lg shrink-0">
              {mealType === 'dinner' ? '🍽️' : '🍛'}
            </span>
            <div className="min-w-0">
              <p className="font-black text-slate-900 text-sm leading-tight truncate">{mealName}</p>
              {vendorName && (
                <p className="text-xs text-slate-500 font-medium mt-0.5 truncate flex items-center gap-1">
                  <ChefHat className="w-3 h-3 text-slate-400 shrink-0" />
                  {vendorName}
                </p>
              )}
            </div>
          </div>

          {addressLine && (
            <div className="flex items-start gap-2 bg-slate-50 rounded-xl px-3 py-2.5">
              <MapPin className="w-3.5 h-3.5 text-brand shrink-0 mt-0.5" />
              <p className="text-xs text-slate-600 font-medium leading-relaxed truncate">{addressLine}</p>
            </div>
          )}
        </div>

        {/* Date & Time Row */}
        <div className="flex items-center gap-2 text-xs text-slate-600 font-semibold">
          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          {deliveredAt ? (
            <span>
              {formatDeliveryDateShort(deliveredAt)} · {formatDeliveryTime(deliveredAt)}
            </span>
          ) : order.date ? (
            <span>
              {order.date}
              {order.scheduledSlot ? ` · ${getSlotTimeLabel(order.scheduledSlot)}` : ''}
            </span>
          ) : null}
        </div>

        {/* Action: View Orders */}
        <Link
          href="/orders"
          className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-slate-900 text-white text-xs font-black uppercase tracking-wider hover:bg-slate-800 active:scale-[0.98] transition-all"
        >
          <span>View Orders</span>
          <ExternalLink className="w-3.5 h-3.5 opacity-70" />
        </Link>
      </div>
    </motion.div>
  );
}

function getSlotTimeLabel(slot: string): string {
  switch (slot) {
    case '8am': return '8:00 AM';
    case '11am': return '11:00 AM';
    case '8pm': return '8:00 PM';
    default: return slot;
  }
}
