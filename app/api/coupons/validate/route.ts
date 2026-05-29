import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { rateLimit, getIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const rl = rateLimit(`coupons:${getIp(req)}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { valid: false, error: 'Demasiadas solicitudes. Intenta más tarde.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetInMs / 1000)) } }
    );
  }

  let body: { code?: unknown; subtotal?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ valid: false, error: 'Código inválido' });
  }

  const { code, subtotal } = body;

  if (!code || typeof code !== 'string') {
    return NextResponse.json({ valid: false, error: 'Código inválido' });
  }
  if (typeof subtotal !== 'number' || subtotal < 0) {
    return NextResponse.json({ valid: false, error: 'Subtotal inválido' });
  }

  const supabase = createAdminClient();
  const { data: coupon } = await supabase
    .from('store_coupons')
    .select('id, code, discount_type, discount_value, min_order_amount, max_uses, uses_count, expires_at')
    .eq('code', code.toUpperCase().trim())
    .eq('active', true)
    .maybeSingle();

  if (!coupon) {
    return NextResponse.json({ valid: false, error: 'Cupón no válido' });
  }
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, error: 'El cupón ha expirado' });
  }
  if (coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses) {
    return NextResponse.json({ valid: false, error: 'El cupón ya no tiene usos disponibles' });
  }
  if (subtotal < (coupon.min_order_amount ?? 0)) {
    return NextResponse.json({ valid: false, error: `Compra mínima para este cupón: $${coupon.min_order_amount}` });
  }

  const discount_amount =
    coupon.discount_type === 'percentage'
      ? Math.floor((subtotal * coupon.discount_value) / 100)
      : Math.min(coupon.discount_value, subtotal);

  return NextResponse.json({
    valid: true,
    coupon_code: coupon.code,
    discount_type: coupon.discount_type,
    discount_value: coupon.discount_value,
    discount_amount,
  });
}
