import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { FirestoreTimestamp, MealType, TicketStatus } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function toMillis(ts: FirestoreTimestamp | Date | null | undefined): number {
  if (!ts) return 0;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'object' && 'seconds' in ts) return ts.seconds * 1000;
  return 0;
}

export function formatDate(ts: FirestoreTimestamp | Date | null | undefined): string {
  const ms = toMillis(ts);
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatMeal(type: MealType | string): string {
  if (type === 'lunch') return 'Lunch';
  if (type === 'dinner') return 'Dinner';
  return 'Full Day';
}

export function ticketStatusLabel(status: TicketStatus): string {
  if (status === 'open') return 'Open';
  if (status === 'in_progress') return 'In Progress';
  return 'Resolved';
}

export function ticketStatusColor(status: TicketStatus): string {
  if (status === 'open') return 'bg-amber-100 text-amber-700';
  if (status === 'in_progress') return 'bg-brand-100 text-brand-700';
  return 'bg-green-100 text-green-700';
}

export function sanitize(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function slugify(str: string): string {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
}

export function truncate(str: string, maxLen: number): string {
  if (!str) return '';
  return str.length <= maxLen ? str : str.slice(0, maxLen) + '…';
}
