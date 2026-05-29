import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase';
import { rateLimit, getIp } from '@/lib/rate-limit';

function generateCode(userId: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seed = userId.replace(/-/g, '').slice(0, 8);
  let code = '';
  for (let i = 0; i < 6; i++) {
    const idx = parseInt(seed[i] || '0', 16) % chars.length;
    code += chars[idx];
  }
  // Agregar 2 chars random para unicidad
  for (let i = 0; i < 2; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { session } } = await supabaseAuth.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: existing, error } = await supabase
    .from('store_referrals')
    .select('code, uses_count, discount_percent')
    .eq('referrer_id', session.user.id)
    .maybeSingle();

  if (error && error.code !== '42P01') {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!existing) {
    return NextResponse.json({ code: null });
  }

  return NextResponse.json({ code: existing.code, uses_count: existing.uses_count, discount_percent: existing.discount_percent });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(`referrals:generate:${getIp(req)}`, 5, 3_600_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Demasiadas solicitudes.' }, { status: 429 });
  }

  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { session } } = await supabaseAuth.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Verificar si el usuario ya tiene código
  const { data: existing } = await supabase
    .from('store_referrals')
    .select('code, uses_count, discount_percent')
    .eq('referrer_id', session.user.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ code: existing.code, uses_count: existing.uses_count, discount_percent: existing.discount_percent });
  }

  // Crear código único
  let code = generateCode(session.user.id);
  let attempts = 0;
  while (attempts < 5) {
    const { data: conflict } = await supabase
      .from('store_referrals')
      .select('id')
      .eq('code', code)
      .maybeSingle();
    if (!conflict) break;
    code = generateCode(session.user.id + attempts);
    attempts++;
  }

  const { data, error } = await supabase
    .from('store_referrals')
    .insert({ referrer_id: session.user.id, code, discount_percent: 10 })
    .select('code, uses_count, discount_percent')
    .single();

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json({ error: 'Módulo de referidos no configurado aún.' }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ code: data.code, uses_count: data.uses_count, discount_percent: data.discount_percent });
}
