import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase';
import { rateLimit, getIp } from '@/lib/rate-limit';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = rateLimit(`rating:${getIp(req)}`, 5, 60_000);
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

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  let body: { rating?: unknown; comment?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'La calificación debe ser un número entre 1 y 5' }, { status: 400 });
  }

  const comment = body.comment && typeof body.comment === 'string'
    ? body.comment.slice(0, 500).trim()
    : null;

  const supabase = createAdminClient();

  // Verificar que la orden pertenece al usuario y está entregada
  const { data: order } = await supabase
    .from('store_orders')
    .select('id, user_id, status')
    .eq('id', id)
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
  }
  if (order.status !== 'delivered') {
    return NextResponse.json({ error: 'Solo puedes calificar pedidos entregados' }, { status: 400 });
  }

  const { error } = await supabase
    .from('store_order_ratings')
    .upsert({
      order_id: id,
      user_id: session.user.id,
      rating,
      comment,
    }, { onConflict: 'order_id' });

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json({ error: 'Módulo de calificaciones no configurado aún.' }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
