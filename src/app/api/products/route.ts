import { NextResponse } from 'next/server';
import { createProduct, listProducts } from '@/lib/products';
import { productSchema } from '@/lib/validators';
import { denyUnlessBackoffice } from '@/lib/auth/api-guard';

export async function GET() {
  const denied = await denyUnlessBackoffice();
  if (denied) return denied;
  return NextResponse.json({ data: await listProducts() });
}

export async function POST(request: Request) {
  const denied = await denyUnlessBackoffice();
  if (denied) return denied;
  const body = await request.json();
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: 'Invalid payload', errors: parsed.error.flatten() }, { status: 400 });
  const row = await createProduct(parsed.data);
  return NextResponse.json({ message: 'Product created', data: row });
}
