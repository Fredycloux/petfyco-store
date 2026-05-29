import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { rateLimit, getIp } from '@/lib/rate-limit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const rl = rateLimit(`referrals:validate:${getIp(req)}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ valid: false, error: 'Demasiadas solicitudes.' }, { status: 429 });
  }

  const { code } = await params;
  if (!code || typeof code !== 'string') {
    return NextResponse.json({ valid: false, error: 'Código inválido' });
  }

  const supabase = createAdminClient();
  const { data: referral, error } = await supabase
    .from('store_referrals')
    .select('id, code, discount_percent, max_uses, uses_count, is_active')
    .eq('code', code.toUpperCase().trim())
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json({ valid: false, error: 'Módulo no disponible aún.' });
    }
    return NextResponse.json({ valid: false, error: 'Error al validar' });
  }

  if (!referral || !referral.is_active) {
    return NextResponse.json({ valid: false, error: 'Código de referido no válido' });
  }

  if (referral.max_uses !== null && referral.uses_count >= referral.max_uses) {
    return NextResponse.json({ valid: false, error: 'Código agotado' });
  }

  return NextResponse.json({
    valid: true,
    code: referral.code,
    discount_percent: referral.discount_percent,
  });
}
