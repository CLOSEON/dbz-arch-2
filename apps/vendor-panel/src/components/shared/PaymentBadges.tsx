/**
 * Payment Status Badge Component
 * Displays payment status with appropriate styling
 */

import { CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';

interface PaymentStatusBadgeProps {
  status: 'captured' | 'failed' | 'pending' | 'authorized';
  size?: 'sm' | 'md' | 'lg';
}

export function PaymentStatusBadge({ status, size = 'md' }: PaymentStatusBadgeProps) {
  const baseClasses = 'inline-flex items-center gap-1 rounded-full px-3 py-1 font-medium';
  
  const sizeClasses = {
    sm: 'text-xs py-0.5 px-2',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-2'
  }[size];

  const config = {
    captured: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      icon: CheckCircle2,
      label: 'Payment Successful'
    },
    failed: {
      bg: 'bg-red-50',
      text: 'text-red-700',
      icon: XCircle,
      label: 'Payment Failed'
    },
    pending: {
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      icon: Clock,
      label: 'Pending'
    },
    authorized: {
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      icon: AlertCircle,
      label: 'Authorized'
    }
  }[status];

  const Icon = config.icon;

  return (
    <div className={`${baseClasses} ${sizeClasses} ${config.bg} ${config.text}`}>
      <Icon className={size === 'sm' ? 'w-3 h-3' : size === 'md' ? 'w-4 h-4' : 'w-5 h-5'} />
      <span>{config.label}</span>
    </div>
  );
}

/**
 * Subscription Status Badge
 * Displays subscription status with appropriate styling
 */

interface SubscriptionStatusBadgeProps {
  status: 'created' | 'authenticated' | 'active' | 'paused' | 'cancelled' | 'failed';
  size?: 'sm' | 'md' | 'lg';
}

export function SubscriptionStatusBadge({ status, size = 'md' }: SubscriptionStatusBadgeProps) {
  const baseClasses = 'inline-flex items-center gap-1 rounded-full px-3 py-1 font-medium';
  
  const sizeClasses = {
    sm: 'text-xs py-0.5 px-2',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-2'
  }[size];

  const config = {
    created: {
      bg: 'bg-slate-50',
      text: 'text-slate-700',
      icon: AlertCircle,
      label: 'Created'
    },
    authenticated: {
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      icon: CheckCircle2,
      label: 'Authenticated'
    },
    active: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      icon: CheckCircle2,
      label: 'Active'
    },
    paused: {
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      icon: Clock,
      label: 'Paused'
    },
    cancelled: {
      bg: 'bg-red-50',
      text: 'text-red-700',
      icon: XCircle,
      label: 'Cancelled'
    },
    failed: {
      bg: 'bg-red-50',
      text: 'text-red-700',
      icon: XCircle,
      label: 'Failed'
    }
  }[status];

  const Icon = config.icon;

  return (
    <div className={`${baseClasses} ${sizeClasses} ${config.bg} ${config.text}`}>
      <Icon className={size === 'sm' ? 'w-3 h-3' : size === 'md' ? 'w-4 h-4' : 'w-5 h-5'} />
      <span>{config.label}</span>
    </div>
  );
}
