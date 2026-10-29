import { NextResponse } from 'next/server';
import { createCustomer, listCustomers } from '@/lib/customers';
import { customerSchema } from '@/lib/validators';
import { denyUnlessBackoffice } from '@/lib/auth/api-guard';

export async function GET() {
  const denied = await denyUnlessBackoffice();
  if (denied) return denied;
  return NextResponse.json({ data: await listCustomers() });
}

export async function POST(request: Request) {
  const denied = await denyUnlessBackoffice();
  if (denied) return denied;
  const body = await request.json();
  const parsed = customerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: 'Invalid payload', errors: parsed.error.flatten() }, { status: 400 });
  const row = await createCustomer(parsed.data);
  return NextResponse.json({ message: 'Customer created', data: row });
}
