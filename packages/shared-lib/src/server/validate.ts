/**
 * Shared input validation and sanitization utilities
 */

/**
 * Basic XSS HTML escaping sanitizer
 */
export function sanitizeString(val: string): string {
  if (typeof val !== 'string') return '';
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validates E.164 phone numbers (e.g. +919876543210 or local 10 digit formats)
 */
export function validateE164Phone(phone: string): boolean {
  if (typeof phone !== 'string') return false;
  // Strip non-digit characters
  const digits = phone.replace(/\D/g, '');
  // Matches 10 digits or 12 digits (with 91 country code)
  return (digits.length === 10 || (digits.length === 12 && digits.startsWith('91')));
}

/**
 * Validates payment amounts in paise (Razorpay standard)
 */
export function validateAmount(amount: number): boolean {
  return typeof amount === 'number' && Number.isInteger(amount) && amount >= 100 && amount <= 10_000_000;
}

/**
 * Validates standard Firestore ID structures to prevent injection
 */
export function validateObjectId(id: string): boolean {
  if (typeof id !== 'string') return false;
  // Must be alphanumeric, dashes, or underscores, between 1 and 128 characters
  return id.length > 0 && id.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(id);
}

/**
 * Validates and matches standard meal types
 */
export function validateMealType(mealType: string): boolean {
  return ['lunch', 'dinner', 'both'].includes(mealType);
}
