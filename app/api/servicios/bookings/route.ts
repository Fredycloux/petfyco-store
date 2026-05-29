import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase';
import { rateLimit, getIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const rl = rateLimit(`servicios:bookings:${getIp(req)}`, 5, 60_000);
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

  let body: {
    service_id?: unknown;
    pet_name?: unknown;
    scheduled_at?: unknown;
    address?: unknown;
    notes?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  if (!body.service_id || typeof body.service_id !== 'string') {
    return NextResponse.json({ error: 'service_id requerido' }, { status: 400 });
  }
  if (!body.scheduled_at || typeof body.scheduled_at !== 'string') {
    return NextResponse.json({ error: 'scheduled_at requerido' }, { status: 400 });
  }
  if (!body.address || typeof body.address !== 'string' || body.address.trim().length < 5) {
    return NextResponse.json({ error: 'Dirección requerida (mínimo 5 caracteres)' }, { status: 400 });
  }

  const scheduledAt = new Date(body.scheduled_at);
  if (isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
    return NextResponse.json({ error: 'La fecha debe ser futura' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Verificar que el servicio existe y está activo
  const { data: service } = await supabase
    .from('pet_services')
    .select('id, name, is_active')
    .eq('id', body.service_id)
    .maybeSingle();

  if (!service || !service.is_active) {
    return NextResponse.json({ error: 'Servicio no disponible' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('pet_service_bookings')
    .insert({
      service_id: body.service_id,
      user_id: session.user.id,
      pet_name: typeof body.pet_name === 'string' ? body.pet_name.slice(0, 100) : null,
      scheduled_at: scheduledAt.toISOString(),
      address: (body.address as string).trim().slice(0, 300),
      notes: typeof body.notes === 'string' ? body.notes.slice(0, 500) : null,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json({ error: 'Módulo de servicios no configurado aún.' }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, booking_id: data.id }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(`servicios:bookings:get:${getIp(req)}`, 30, 60_000);
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
  const { data, error } = await supabase
    .from('pet_service_bookings')
    .select('*, service:pet_services(name, category, price)')
    .eq('user_id', session.user.id)
    .order('scheduled_at', { ascending: false });

  if (error) {
    if (error.code === '42P01') return NextResponse.json({ bookings: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ bookings: data ?? [] });
}
