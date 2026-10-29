import { z } from 'zod';

export const customerSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  taxId: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  email: z.string().optional().default(''),
  address: z.string().optional().default(''),
});

export const productSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  price: z.coerce.number().nonnegative(),
  barcode: z.string().optional().default(''),
  canBeSold: z.coerce.boolean().optional().default(true),
  canBePurchased: z.coerce.boolean().optional().default(false),
});

export const saleOrderDraftSchema = z.object({
  odooPartnerId: z.coerce.number().int().positive(),
  customerName: z.string().min(1),
  taxId: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  email: z.string().optional().default(''),
  address: z.string().optional().default(''),
  remark: z.string().optional().default(''),
  items: z.array(
    z.object({
      odooProductId: z.coerce.number().int().positive(),
      productName: z.string().min(1),
      qty: z.coerce.number().positive(),
      price: z.coerce.number().nonnegative(),
      discount: z.coerce.number().min(0).max(100).default(0),
    })
  ).min(1),
});
