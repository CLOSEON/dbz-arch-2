/**
 * Dabzzo Tiffin Box Tagging Utility
 * Format: [CustomerInitials][VendorInitials][BoxSeq#]([PlanCode: O/W/M])[Cycle#]
 * Example: STTV01(W)1 (Siddhesh Thakur, Test Vendor, Box 01, Weekly Plan, Cycle 1)
 */

export interface BoxTagParams {
  customerName?: string;
  vendorName?: string;
  sequenceNumber?: number;
  planType?: string; // 'trial' | 'weekly' | 'monthly' | 'one_time'
  cycleNumber?: number;
  orderId?: string;
}

export function getCustomerInitials(name?: string): string {
  if (!name) return 'DB';
  const clean = name.trim().replace(/[^a-zA-Z\s]/g, '').toUpperCase();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`;
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2);
  }
  return parts[0] ? `${parts[0][0]}X` : 'DB';
}

export function getVendorInitials(name?: string): string {
  if (!name) return 'VK';
  const clean = name.trim().replace(/[^a-zA-Z\s]/g, '').toUpperCase();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`;
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2);
  }
  return parts[0] ? `${parts[0][0]}K` : 'VK';
}

export function getPlanCode(planType?: string): 'O' | 'W' | 'M' {
  if (!planType) return 'W';
  const lower = planType.toLowerCase();
  if (lower.includes('month') || lower === 'monthly' || lower === 'm') return 'M';
  if (lower.includes('week') || lower === 'weekly' || lower === 'w') return 'W';
  return 'O'; // One-time / Trial / Single
}

export function generateBoxTag({
  customerName = 'Customer',
  vendorName = 'Vendor',
  sequenceNumber = 1,
  planType = 'weekly',
  cycleNumber = 1,
  orderId
}: BoxTagParams): string {
  const cInit = getCustomerInitials(customerName);
  const vInit = getVendorInitials(vendorName);
  const seqStr = String(sequenceNumber).padStart(2, '0');
  const pCode = getPlanCode(planType);
  const cycle = Math.max(1, cycleNumber || 1);
  return `${cInit}${vInit}${seqStr}(${pCode})${cycle}`;
}
