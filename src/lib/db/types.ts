/**
 * Row types for the Supabase tables (schema: `supabase/migrations`).
 * Timestamps are revived to `Date` by `reviveDates`; JSON columns stay `unknown`-ish.
 */

export type OdooSyncStatus = 'LocalOnly' | 'Syncing' | 'Synced' | 'Failed';
export type ApprovalStatus = 'Draft' | 'Approved';
export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'SALES' | 'WAREHOUSE' | 'DEALER_OWNER' | 'DEALER_STAFF';
export type DealerType = 'CAR' | 'TRUCK' | 'MOTORCYCLE' | 'BATTERY' | 'WHEEL';
export type DealerTier = 'S' | 'M' | 'L';
export type DealerStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';
export type LeadStatus = 'NEW' | 'CONTACTED' | 'APPROVED' | 'REJECTED';
export type ResetRequestStatus = 'PENDING' | 'DONE' | 'DISMISSED';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Customer = {
  id: string;
  code: string;
  name: string;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  odooPartnerId: number | null;
  odooSyncStatus: OdooSyncStatus;
  odooSyncError: string | null;
  syncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type Product = {
  id: string;
  code: string;
  name: string;
  price: number;
  barcode: string | null;
  canBeSold: boolean;
  canBePurchased: boolean;
  odooProductId: number | null;
  odooSyncStatus: OdooSyncStatus;
  odooSyncError: string | null;
  syncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type SaleOrder = {
  id: string;
  orderNo: string;
  odooPartnerId: number;
  customerName: string;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  remark: string | null;
  approvalStatus: ApprovalStatus;
  odooSyncStatus: OdooSyncStatus;
  odooSaleOrderId: number | null;
  odooSaleOrderName: string | null;
  odooSyncError: string | null;
  createdAt: Date;
  approvedAt: Date | null;
  syncedAt: Date | null;
};

export type SaleOrderItem = {
  id: string;
  saleOrderId: string;
  odooProductId: number;
  productName: string;
  qty: number;
  price: number;
  discount: number;
};

export type User = {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  /** Contact phone (staff profile); null when not set. */
  phone: string | null;
  /** Profile picture file in the `avatars` bucket; null when not set. */
  avatarFile: string | null;
  role: Role;
  dealerId: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  /** LINE user id from LINE Login; pushes go here. Null until the user links LINE. */
  lineUserId?: string | null;
  lineLinkedAt?: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Session = {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
};

export type Dealer = {
  id: string;
  name: string;
  odooPartnerId: number | null;
  types: DealerType[];
  tier: DealerTier;
  province: string;
  address: string | null;
  /** Structured delivery address `{ line, subdistrict, district, province, postalCode }`; `address` keeps the one-line text. */
  shippingAddress: Json | null;
  phone: string | null;
  lineId: string | null;
  taxId: string | null;
  /** Credit customer: may order on credit terms; paying cash earns the credit→cash price difference as an end-of-bill discount. */
  creditEnabled: boolean;
  /** Web credit limit in baht; null = no web limit (Odoo's credit_limit may still apply). NUMERIC, may arrive as a string. */
  creditLimit: number | string | null;
  /** Debt carried over from before the web, counted as used credit. NUMERIC, may arrive as a string. */
  creditOpening: number | string;
  /** Odoo pricelist id per product family (`{ "MOTORCYCLE": 7, "CAR": 9 }`); families left out use the normal price. */
  typePricelists: Partial<Record<DealerType, number>> | null;
  /** Cash discount % per product family (`{ "CAR": 2 }`), overriding the pricelist %; 0 = none. */
  typeCashPercents: Partial<Record<DealerType, number>> | null;
  /** Profile picture in the private `avatars` bucket, uploaded by the dealer owner. */
  avatarFile: string | null;
  status: DealerStatus;
  approvedAt: Date | null;
  approvedById: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DealerLead = {
  id: string;
  shopName: string;
  province: string;
  types: DealerType[];
  phone: string;
  lineId: string | null;
  source: string;
  status: LeadStatus;
  note: string | null;
  dealerId: string | null;
  createdAt: Date;
  handledAt: Date | null;
  /** Owner login chosen at sign-up; becomes the DEALER_OWNER account on approval. */
  email: string | null;
  /** scrypt hash of the chosen password; cleared once the lead is approved or rejected. */
  passwordHash: string | null;
  /** Structured shop address (ThaiAddress) from the sign-up form. */
  address: unknown;
  /** Thai tax id, 13 digits; the key used to spot an applicant that is already a dealer or Odoo customer. */
  taxId: string | null;
  /** When the applicant accepted the privacy notice (PDPA); null on leads from before the checkbox existed. */
  consentAt?: Date | null;
};

export type PasswordResetRequest = {
  id: string;
  userId: string;
  contact: string | null;
  status: ResetRequestStatus;
  ip: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedById: string | null;
};

export type AuditLog = {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string;
  diff: Json | null;
  createdAt: Date;
};
