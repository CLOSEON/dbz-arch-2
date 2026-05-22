import { Timestamp } from 'firebase/firestore';

/**
 */
export type DeliveryStatus = "pending" | "preparing" | "picked_up" | "out_for_delivery" | "delivered" | "failed" | "failed_attempt";
/**
 * Detailed information about a single delivery order in the system.
 */
export interface DeliveryOrder {
  /** Unique identifier of the delivery order transaction */
  id: string;
  /** Reference to the associated active subscription plan */
  subscriptionId: string;
  /** Reference to the customer's user account identifier */
  customerId: string;
  /** Reference to the vendor kitchen's user account identifier */
  vendorId: string;
  /** Reference to the assigned delivery driver's user account, or null if unassigned */
  driverId: string | null;
  /** The current delivery lifecycle status */
  status: DeliveryStatus;
  /** A secure 4-digit One-Time Password required to verify delivery completion */
  otp: string;
  /** Flag showing whether the customer's delivery OTP has been verified by the driver */
  otpVerified: boolean;
  /** Details about the specific meal being transported */
  meal: {
    /** The display name or description of the meal package */
    name: string;
    /** The slot designated for the meal */
    type: "lunch" | "dinner";
  };
  /** Destination delivery address and mapping coordinates */
  address: {
    /** Complete street address line */
    line1: string;
    /** Optional landmark/directions helpful for the delivery driver */
    landmark?: string;
    /** Decimal latitude coordinate for precise map plotting */
    lat: number;
    /** Decimal longitude coordinate for precise map plotting */
    lng: number;
  };
  /** Live geographical location coordinates of the driver assigned to this order */
  driverLocation: {
    /** Decimal latitude coordinate */
    lat: number;
    /** Decimal longitude coordinate */
    lng: number;
    /** The Firestore timestamp when the driver location was last updated */
    updatedAt: Timestamp;
  } | null;
  /** Transition timestamps for audit trails, tracking duration, and computing SLAs */
  timestamps: {
    /** The timestamp when the vendor kitchen completed preparing and packaging the meal */
    preparedAt: Timestamp | null;
    /** The timestamp when the driver retrieved the meal from the vendor */
    pickedAt: Timestamp | null;
    /** The timestamp when the driver began moving towards the delivery destination */
    outAt: Timestamp | null;
    /** The timestamp when the order was successfully completed and handed over to the customer */
    deliveredAt: Timestamp | null;
  };
  /** The creation timestamp when the delivery record was initially generated */
  createdAt: Timestamp;
}

/**
 * Profile structure for a registered delivery logistics partner/driver.
 */
export interface DriverProfile {
  /** The unique authentication user identifier of the driver */
  uid: string;
  /** Driver's full display name */
  name: string;
  /** Driver's contact mobile phone number */
  phone: string;
  /** Vehicle license plate or registration number */
  vehicleNumber: string;
  /** Boolean state representing whether the driver is actively online and accepting jobs */
  isActive: boolean;
  /** Driver's live current location broadcasted continuously from the native device GPS sensor */
  currentLocation: {
    /** Decimal latitude coordinate */
    lat: number;
    /** Decimal longitude coordinate */
    lng: number;
    /** Timestamp when this device position was recorded */
    updatedAt: Timestamp;
  } | null;
  /** Aggregate delivery statistics tracked for the current operating day */
  todayStats: {
    /** Number of orders assigned to the driver today */
    assigned: number;
    /** Number of successfully completed deliveries today */
    delivered: number;
    /** Number of deliveries marked as failed today */
    failed: number;
  };
}

/**
 * Schema representing notifications pushed to stakeholders regarding delivery events.
 */
export interface DeliveryNotification {
  /** Reference to the associated delivery order ID */
  orderId: string;
  /** Categorized event classification type for UI handling */
  type: "status_change" | "otp_request" | "delay_alert";
  /** Descriptive notification alert copy */
  message: string;
  /** Timestamp when the notification record was generated */
  createdAt: Timestamp;
}
