import type { SaleOrder, SaleOrderItem } from '@/lib/db/types';

export type { SaleOrder, SaleOrderItem };

export type SaleOrderWithItems = SaleOrder & { items: SaleOrderItem[] };

export type SaleOrderItemDraft = {
  odooProductId: number;
  productName: string;
  qty: number;
  price: number;
  discount: number;
};

export type SaleOrderDraft = {
  odooPartnerId: number;
  customerName: string;
  taxId?: string;
  phone?: string;
  email?: string;
  address?: string;
  remark?: string;
  items: SaleOrderItemDraft[];
};
