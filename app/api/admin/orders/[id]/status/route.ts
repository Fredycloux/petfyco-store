import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase';
import { rateLimit } from '@/lib/rate-limit';

const VALID_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'] as const;
type OrderStatus = typeof VALID_STATUSES[number];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const rl = rateLimit(`admin:orders:${admin}`, 200, 3_600_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiadas operaciones. Intenta en un momento.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetInMs / 1000)) } }
    );
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  let body: { status: OrderStatus };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  if (!VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Obtener estado actual antes de modificar (para auditoría)
  const { data: currentOrder, error: fetchError } = await supabase
    .from('store_orders')
    .select('status, user_id')
    .eq('id', id)
    .single();

  if (fetchError || !currentOrder) {
    return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
  }

  // Registrar cambio de estado en auditoría
  await supabase.from('store_order_logs').insert({
    order_id: id,
    changed_by: admin,
    previous_status: currentOrder.status,
    new_status: body.status,
  });

  const { error } = await supabase
    .from('store_orders')
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Notificar al usuario vía push (best-effort — no falla el update si falla la notificación)
  const NOTIF_MESSAGES: Partial<Record<OrderStatus, string>> = {
    confirmed: '¡Tu pedido fue confirmado!',
    shipped: 'Tu pedido está en camino 🚚',
    delivered: '¡Tu pedido fue entregado! ¿Cómo fue tu experiencia?',
  };
  const message = NOTIF_MESSAGES[body.status];
  if (message && currentOrder.user_id) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://petfyco-store.vercel.app';
    fetch(`${siteUrl}/api/notifications/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '',
      },
      body: JSON.stringify({ user_id: currentOrder.user_id, message }),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
