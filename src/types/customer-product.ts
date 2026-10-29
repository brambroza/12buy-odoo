import type { Customer, Product } from '@/lib/db/types';

export type { Customer, Product };

export type CustomerDraft = {
  code: string;
  name: string;
  taxId?: string;
  phone?: string;
  email?: string;
  address?: string;
};

export type ProductDraft = {
  code: string;
  name: string;
  price: number;
  barcode?: string;
  canBeSold?: boolean;
  canBePurchased?: boolean;
};
