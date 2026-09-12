'use client';

import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ 
  icon = <Inbox className="w-8 h-8 text-brand stroke-[1.5]" />, 
  title, 
  description, 
  action 
}: EmptyStateProps) {
  return (
    <div className="bg-white rounded-3xl p-8 sm:p-10 border border-slate-200/80 shadow-[0_4px_24px_rgba(15,23,42,0.03)] text-center flex flex-col items-center justify-center my-6 animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-brand flex items-center justify-center mb-4 shadow-xs">
        {icon}
      </div>
      <h3 className="text-lg font-black text-slate-900 mb-1">{title}</h3>
      {description && <p className="text-xs font-medium text-slate-500 max-w-xs leading-relaxed">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
