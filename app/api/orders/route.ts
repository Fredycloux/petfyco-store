import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase';
import { rateLimit, getIp } from '@/lib/rate-limit';
import { getCoverageStatus, calcShipping, FREE_SHIPPING_THRESHOLD } from '@/lib/coverage';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  // Rate limit: 5 órdenes por minuto — por user_id si autenticado, por IP si no
  const ip = getIp(req);
  const cookieStoreRL = await cookies();
  const supabaseRL = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStoreRL.getAll(), setAll: () => {} } }
  );
  const { data: { session: sessionRL } } = await supabaseRL.auth.getSession();
  const rlKey = sessionRL?.user?.id ? `orders:user:${sessionRL.user.id}` : `orders:ip:${ip}`;
  const rl = rateLimit(rlKey, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Intenta en unos segundos.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetInMs / 1000)) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    items,
    billing,
    payment_method,
    delivery_same,
    delivery_address,
    delivery_city,
    delivery_depto,
    coupon_code,
    referral_code,
  } = body as {
    items: { product_id: string; quantity: number }[];
    billing: {
      billing_name: string;
      billing_id_type: string;
      billing_id: string;
      billing_razon_social?: string;
      billing_email: string;
      billing_phone: string;
      billing_address: string;
      billing_city: string;
      billing_depto: string;
    };
    payment_method: string;
    delivery_same: boolean;
    delivery_address?: string;
    delivery_city?: string;
    delivery_depto?: string;
    coupon_code?: string | null;
    referral_code?: string | null;
  };

  // Obtener user_id verificado server-side (B1 fix — no confiar en el cliente)
  const cookieStore = await cookies();
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { session } } = await supabaseUser.auth.getSession();
  const serverUserId = session?.user?.id ?? null;

  // Validar estructura básica
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'No items' }, { status: 400 });
  }
  if (!billing?.billing_email || !billing?.billing_name) {
    return NextResponse.json({ error: 'Missing billing data' }, { status: 400 });
  }
  // B5 — validar formato email
  if (!EMAIL_REGEX.test(billing.billing_email as string)) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 });
  }
  if (!['wompi', 'transferencia'].includes(payment_method)) {
    return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 });
  }

  // Validar cantidades
  for (const item of items) {
    if (!item.product_id || typeof item.quantity !== 'number' || item.quantity < 1 || !Number.isInteger(item.quantity)) {
      return NextResponse.json({ error: 'Invalid item' }, { status: 400 });
    }
  }

  const supabase = createAdminClient();

  // Obtener precios reales desde la BD — nunca confiar en el cliente
  const productIds = items.map((i) => i.product_id);
  const { data: products, error: productsError } = await supabase
    .from('store_products')
    .select('id, name, sku, price, active, stock')
    .in('id', productIds)
    .eq('active', true);

  if (productsError || !products) {
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }

  // Verificar que todos los productos existen, están activos y tienen stock suficiente
  const productMap = new Map(products.map((p) => [p.id, p]));
  for (const item of items) {
    const product = productMap.get(item.product_id);
    if (!product) {
      return NextResponse.json({ error: `Product not available: ${item.product_id}` }, { status: 400 });
    }
    if (item.quantity > product.stock) {
      return NextResponse.json(
        { error: `Stock insuficiente para "${product.name}". Disponible: ${product.stock}` },
        { status: 400 }
      );
    }
  }

  // Calcular subtotal con precios reales de la BD
  let subtotal = 0;
  const orderItems = items.map((item) => {
    const product = productMap.get(item.product_id)!;
    const lineSubtotal = product.price * item.quantity;
    subtotal += lineSubtotal;
    return {
      product_id: item.product_id,
      product_name: product.name,
      product_sku: product.sku || null,
      unit_price: product.price,
      quantity: item.quantity,
      subtotal: lineSubtotal,
    };
  });

  // Validar cupón server-side (re-validar — no confiar en el cliente)
  let discount = 0;
  let appliedCouponCode: string | null = null;
  let appliedCouponId: string | null = null;
  if (coupon_code && typeof coupon_code === 'string') {
    const { data: coupon } = await supabase
      .from('store_coupons')
      .select('id, code, discount_type, discount_value, min_order_amount, max_uses, uses_count, expires_at')
      .eq('code', coupon_code.toUpperCase().trim())
      .eq('active', true)
      .maybeSingle();

    const couponValid =
      coupon &&
      (!coupon.expires_at || new Date(coupon.expires_at) >= new Date()) &&
      (coupon.max_uses === null || coupon.uses_count < coupon.max_uses) &&
      subtotal >= (coupon.min_order_amount ?? 0);

    if (couponValid) {
      discount =
        coupon.discount_type === 'percentage'
          ? Math.floor((subtotal * coupon.discount_value) / 100)
          : Math.min(coupon.discount_value, subtotal);
      appliedCouponCode = coupon.code;
      appliedCouponId = coupon.id;
    }
  }

  // Validar referido server-side (adicional al cupón, best-effort)
  let referralExtraDiscount = 0;
  let appliedReferralId: string | null = null;
  if (referral_code && typeof referral_code === 'string') {
    const { data: referral, error: refError } = await supabase
      .from('store_referrals')
      .select('id, discount_percent, uses_count, max_uses, is_active')
      .eq('code', referral_code.toUpperCase().trim())
      .eq('is_active', true)
      .maybeSingle();
    if (!refError || refError.code !== '42P01') {
      if (referral && (referral.max_uses === null || referral.uses_count < referral.max_uses)) {
        referralExtraDiscount = Math.floor((subtotal * referral.discount_percent) / 100);
        appliedReferralId = referral.id;
      }
    }
  }
  const totalDiscount = Math.min(discount + referralExtraDiscount, subtotal);

  // Calcular envío server-side (sobre el subtotal con descuento aplicado)
  const deliveryCity  = delivery_same ? billing.billing_city  : (delivery_city  ?? '');
  const deliveryDepto = delivery_same ? billing.billing_depto : (delivery_depto ?? '');
  const shipping = calcShipping(subtotal - totalDiscount, deliveryCity, deliveryDepto);
  const total    = subtotal - totalDiscount + shipping;

  // Crear orden
  const orderNumber = 'PFC-' + Date.now().toString().slice(-8);

  const { data: order, error: orderError } = await supabase
    .from('store_orders')
    .insert({
      order_number:       orderNumber,
      user_id:            serverUserId,
      status:             'pending',
      subtotal,
      discount:           totalDiscount,
      shipping,
      total,
      billing_name:       billing.billing_name,
      billing_id_type:    billing.billing_id_type,
      billing_id:         billing.billing_id,
      billing_razon_social: billing.billing_razon_social || null,
      billing_email:      billing.billing_email,
      billing_phone:      billing.billing_phone,
      billing_address:    billing.billing_address,
      billing_city:       billing.billing_city,
      billing_depto:      billing.billing_depto,
      delivery_address:   delivery_same ? billing.billing_address : (delivery_address ?? billing.billing_address),
      delivery_city:      deliveryCity,
      delivery_depto:     deliveryDepto,
      payment_method,
      payment_status:     'pending',
    })
    .select()
    .single();

  if (orderError || !order) {
    console.error('Order creation error:', orderError?.message);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }

  // Insertar items con order_id real
  const { error: itemsError } = await supabase
    .from('store_order_items')
    .insert(orderItems.map((i) => ({ ...i, order_id: order.id })));

  if (itemsError) {
    console.error('Order items error:', itemsError.message);
    return NextResponse.json({ error: 'Failed to create order items' }, { status: 500 });
  }

  // Descontar stock de forma atómica — previene overselling con requests concurrentes
  for (const item of orderItems) {
    const { data: decremented } = await supabase.rpc('decrement_stock', {
      p_product_id: item.product_id,
      p_quantity: item.quantity,
    });
    if (!decremented) {
      await supabase
        .from('store_orders')
        .update({ status: 'stock_error' })
        .eq('id', order.id);
      return NextResponse.json(
        { error: 'Stock insuficiente para uno o más productos' },
        { status: 409 }
      );
    }
  }

  // Incrementar uses_count del cupón — atómico via RPC (best-effort, no falla la orden)
  if (appliedCouponId) {
    try {
      await supabase.rpc('increment_coupon_uses', { p_coupon_id: appliedCouponId });
    } catch (err) {
      console.error('[orders] increment_coupon_uses failed:', err);
    }
  }

  // Incrementar uses_count del referido (best-effort — read + write atómico suficiente al volumen actual)
  if (appliedReferralId) {
    const { data: ref } = await supabase
      .from('store_referrals')
      .select('uses_count')
      .eq('id', appliedReferralId)
      .single();
    if (ref) {
      void supabase
        .from('store_referrals')
        .update({ uses_count: ref.uses_count + 1 })
        .eq('id', appliedReferralId);
    }
  }

  // Para transferencia: enviar email de confirmación server-side (tiene acceso al secret)
  if (payment_method === 'transferencia') {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://petfyco-store.vercel.app';
    fetch(`${siteUrl}/api/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '',
      },
      body: JSON.stringify({
        order_number:    order.order_number,
        billing_name:    billing.billing_name,
        billing_email:   billing.billing_email,
        delivery_address: delivery_same ? billing.billing_address : (delivery_address ?? billing.billing_address),
        delivery_city:   deliveryCity,
        delivery_depto:  deliveryDepto,
        items:           orderItems.map((i) => ({
          product_name: i.product_name,
          quantity:     i.quantity,
          unit_price:   i.unit_price,
          subtotal:     i.subtotal,
        })),
        subtotal,
        discount: totalDiscount,
        coupon_code: appliedCouponCode,
        shipping,
        total,
        payment_method,
      }),
    }).catch(() => {});
  }

  // Para Wompi: construir URL de pago server-side con monto validado
  if (payment_method === 'wompi') {
    const wompiKey = process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY;
    if (!wompiKey) {
      return NextResponse.json({ error: 'Wompi no está disponible' }, { status: 503 });
    }
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://petfyco-store.vercel.app';
    const params = new URLSearchParams({
      'public-key': wompiKey,
      currency: 'COP',
      'amount-in-cents': String(total * 100),
      reference: orderNumber,
      'redirect-url': `${siteUrl}/pago/resultado`,
    });
    return NextResponse.json({
      order_number: orderNumber,
      wompi_url: `https://checkout.wompi.co/p/?${params.toString()}`,
    });
  }

  return NextResponse.json({ order_number: orderNumber });
}
