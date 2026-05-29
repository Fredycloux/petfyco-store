'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, ChevronRight, Truck, CreditCard, MapPin, AlertTriangle, XCircle } from 'lucide-react';
import { supabase, formatCOP } from '@/lib/supabase';
import { useCartStore } from '@/lib/cart-store';
import { getCoverageStatus, calcShipping, FREE_SHIPPING_THRESHOLD, SHIPPING_BY_ZONE, type CoverageStatus } from '@/lib/coverage';
import toast from 'react-hot-toast';


const COVERAGE_LABELS: Record<CoverageStatus, { text: string; sub: string; color: string; Icon: React.ElementType }> = {
  sabaneta:    { text: '¡Zona de cobertura!', sub: 'Sabaneta — entrega el mismo día o siguiente día hábil', color: 'bg-green-50 border-green-300 text-green-700', Icon: Check },
  medellin:    { text: '¡Zona de cobertura!', sub: 'Medellín — entrega en 1 día hábil', color: 'bg-green-50 border-green-300 text-green-700', Icon: Check },
  metro_close: { text: '¡Zona de cobertura!', sub: 'Área metropolitana cercana — 1 a 2 días hábiles', color: 'bg-green-50 border-green-300 text-green-700', Icon: Check },
  metro_far:   { text: '¡Zona de cobertura!', sub: 'Área metropolitana — 1 a 2 días hábiles', color: 'bg-green-50 border-green-300 text-green-700', Icon: Check },
  outside:     { text: 'Fuera de cobertura', sub: 'Solo enviamos al área metropolitana de Medellín. Contáctanos por WhatsApp para verificar.', color: 'bg-orange-50 border-orange-300 text-orange-700', Icon: AlertTriangle },
  unknown:     { text: 'Ingresa ciudad y departamento', sub: 'Verificaremos si hay cobertura en tu zona.', color: 'bg-gray-50 border-gray-200 text-petfy-grey-text', Icon: MapPin },
};

const COLOMBIA_DEPTOS = [
  'Amazonas','Antioquia','Arauca','Atlántico','Bolívar','Boyacá','Caldas','Caquetá',
  'Casanare','Cauca','Cesar','Chocó','Córdoba','Cundinamarca','Guainía','Guaviare',
  'Huila','La Guajira','Magdalena','Meta','Nariño','Norte de Santander','Putumayo',
  'Quindío','Risaralda','San Andrés y Providencia','Santander','Sucre','Tolima',
  'Valle del Cauca','Vaupés','Vichada',
];

const billingSchema = z.object({
  billing_id_type: z.enum(['CC','NIT','CE','PA']),
  billing_id: z.string().min(5, 'ID requerido'),
  billing_name: z.string().min(2, 'Nombre requerido'),
  billing_razon_social: z.string().optional(),
  billing_email: z.string().email('Correo inválido'),
  billing_phone: z.string().regex(/^\d{10}$/, 'Teléfono debe tener 10 dígitos'),
  billing_address: z.string().min(5, 'Dirección requerida'),
  billing_city: z.string().min(2, 'Ciudad requerida'),
  billing_depto: z.string().min(2, 'Departamento requerido'),
  delivery_same: z.boolean().optional(),
  delivery_address: z.string().optional(),
  delivery_city: z.string().optional(),
  delivery_depto: z.string().optional(),
  legal_accepted: z.literal(true, { errorMap: () => ({ message: 'Debes aceptar los Términos y Condiciones para continuar' }) }),
  privacy_accepted: z.literal(true, { errorMap: () => ({ message: 'Debes aceptar la Política de Privacidad para continuar' }) }),
}).superRefine((data, ctx) => {
  if (!data.delivery_same) {
    if (!data.delivery_address?.trim()) ctx.addIssue({ path: ['delivery_address'], code: z.ZodIssueCode.custom, message: 'Dirección de entrega requerida' });
    if (!data.delivery_city?.trim())    ctx.addIssue({ path: ['delivery_city'],    code: z.ZodIssueCode.custom, message: 'Ciudad de entrega requerida' });
    if (!data.delivery_depto?.trim())   ctx.addIssue({ path: ['delivery_depto'],   code: z.ZodIssueCode.custom, message: 'Departamento de entrega requerido' });
  }
});

type BillingData = z.infer<typeof billingSchema>;

type Step = 1 | 2 | 3;


export default function CheckoutPage() {
  const router = useRouter();
  const { items, total, clearCart, coupon } = useCartStore();
  const [step, setStep] = useState<Step>(1);
  const [billingData, setBillingData] = useState<BillingData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [stockErrors, setStockErrors] = useState<string[]>([]);
  const [referralCode, setReferralCode] = useState('');
  const [referralDiscount, setReferralDiscount] = useState(0);
  const [referralApplied, setReferralApplied] = useState(false);
  const [referralChecking, setReferralChecking] = useState(false);

  // Revalidar stock del carrito contra la BD al montar el checkout
  useEffect(() => {
    if (items.length === 0) return;
    const ids = items.map((i) => i.product.id);
    supabase
      .from('store_products')
      .select('id, stock, name')
      .in('id', ids)
      .then(({ data }) => {
        if (!data) return;
        const errors: string[] = [];
        for (const item of items) {
          const fresh = data.find((p) => p.id === item.product.id);
          if (!fresh) continue;
          if (fresh.stock < item.quantity) {
            errors.push(
              `"${item.product.name}": solicitaste ${item.quantity} pero solo hay ${fresh.stock} disponibles.`
            );
          }
        }
        setStockErrors(errors);
      });
  }, [items]);

  const cartTotal = total();
  const couponDiscount = coupon?.discount_amount ?? 0;
  const isFreeShipping = (cartTotal - couponDiscount - referralDiscount) >= FREE_SHIPPING_THRESHOLD;

  const applyReferral = async () => {
    const code = referralCode.trim().toUpperCase();
    if (!code) return;
    setReferralChecking(true);
    try {
      const res = await fetch(`/api/referrals/${code}`);
      const data = await res.json() as { valid?: boolean; discount_percent?: number; error?: string };
      if (res.ok && data.valid && data.discount_percent) {
        const amt = Math.floor((cartTotal * data.discount_percent) / 100);
        setReferralDiscount(amt);
        setReferralApplied(true);
        toast.success(`Código de referido aplicado: ${data.discount_percent}% de descuento`);
      } else {
        toast.error(data.error ?? 'Código de referido inválido');
        setReferralDiscount(0);
        setReferralApplied(false);
      }
    } catch {
      toast.error('Error al validar el código');
    } finally {
      setReferralChecking(false);
    }
  };

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<BillingData>({
    resolver: zodResolver(billingSchema),
    defaultValues: { billing_id_type: 'CC', delivery_same: true },
  });

  // Pre-llenar formulario desde profiles si el usuario está autenticado
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, email, phone, depto, municipio')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!profile) return;
      reset((prev) => ({
        ...prev,
        billing_name: profile.display_name || prev.billing_name || '',
        billing_email: profile.email || session.user.email || prev.billing_email || '',
        billing_phone: profile.phone || prev.billing_phone || '',
        billing_depto: profile.depto || prev.billing_depto || '',
        billing_city: profile.municipio || prev.billing_city || '',
      }));
    });
  }, [reset]);

  const deliverySame = watch('delivery_same');
  const billingCity = watch('billing_city');
  const billingDepto = watch('billing_depto');
  const deliveryCity = watch('delivery_city');
  const deliveryDepto = watch('delivery_depto');

  const activeCity = deliverySame ? billingCity : deliveryCity;
  const activeDepto = deliverySame ? billingDepto : deliveryDepto;
  const coverageStatus = getCoverageStatus(activeCity ?? '', activeDepto ?? '');
  const { text: covText, sub: covSub, color: covColor, Icon: CovIcon } = COVERAGE_LABELS[coverageStatus];

  const shipping = isFreeShipping ? 0 : SHIPPING_BY_ZONE[coverageStatus];
  const orderTotal = cartTotal - couponDiscount - referralDiscount + shipping;

  const onBillingSubmit = (data: BillingData) => {
    setBillingData(data);
    setStep(2);
  };

  const createOrder = async (paymentMethod: string) => {
    if (!billingData || items.length === 0) return;

    if (paymentMethod === 'wompi' && !process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY) {
      toast.error('Pago con Wompi no está disponible aún. Usa transferencia bancaria.');
      return;
    }

    setSubmitting(true);
    try {
      // Enviar solo product_id + quantity — el servidor valida precios desde la BD
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
          billing: {
            billing_name:         billingData.billing_name,
            billing_id_type:      billingData.billing_id_type,
            billing_id:           billingData.billing_id,
            billing_razon_social: billingData.billing_razon_social,
            billing_email:        billingData.billing_email,
            billing_phone:        billingData.billing_phone,
            billing_address:      billingData.billing_address,
            billing_city:         billingData.billing_city,
            billing_depto:        billingData.billing_depto,
          },
          payment_method:  paymentMethod,
          delivery_same:   deliverySame,
          delivery_address: billingData.delivery_address,
          delivery_city:   billingData.delivery_city,
          delivery_depto:  billingData.delivery_depto,
          coupon_code:     coupon?.code ?? null,
          referral_code:   referralApplied ? referralCode.trim().toUpperCase() : null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Error al crear el pedido');
      }

      const data = await res.json() as { order_number: string; wompi_url?: string };

      if (paymentMethod === 'wompi') {
        clearCart();
        // URL construida y firmada por el servidor con el monto validado
        window.location.href = data.wompi_url!;
        return;
      }

      // Transferencia: email ya fue enviado server-side en /api/orders
      clearCart();
      toast.success('¡Pedido creado exitosamente!');
      router.push(`/pedidos?order=${data.order_number}`);
    } catch (err) {
      console.error('Checkout error:', err instanceof Error ? err.message : String(err));
      toast.error(err instanceof Error ? err.message : 'Error al crear el pedido. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  if (items.length === 0) {
    router.push('/carrito');
    return null;
  }

  const steps = [
    { n: 1, label: 'Facturación' },
    { n: 2, label: 'Revisión' },
    { n: 3, label: 'Pago' },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl font-extrabold text-navy mb-8">Checkout</h1>

      {/* Steps */}
      <div className="flex items-center mb-10">
        {steps.map((s, idx) => (
          <div key={s.n} className="flex items-center flex-1">
            <div className="flex items-center gap-2">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${
                step > s.n ? 'bg-green-500 text-white' : step === s.n ? 'bg-primary text-white' : 'bg-gray-200 text-petfy-grey-text'
              }`}>
                {step > s.n ? <Check size={16} /> : s.n}
              </div>
              <span className={`text-sm font-semibold hidden sm:block ${step === s.n ? 'text-primary' : step > s.n ? 'text-green-600' : 'text-petfy-grey-text'}`}>
                {s.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div className="flex-1 h-0.5 mx-3 bg-gray-200">
                <div className={`h-full bg-primary transition-all ${step > s.n ? 'w-full' : 'w-0'}`} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          {/* STEP 1: Billing */}
          {step === 1 && (
            <form onSubmit={handleSubmit(onBillingSubmit)} className="bg-white rounded-2xl shadow-card p-8 space-y-5">
              <h2 className="text-xl font-bold text-navy">Datos de Facturación</h2>

              {/* Advertencias de stock desactualizado */}
              {stockErrors.length > 0 && (
                <div className="bg-red-50 border border-red-300 rounded-xl p-4 text-sm text-red-700 space-y-1">
                  <p className="font-semibold">⚠️ Stock insuficiente para algunos productos:</p>
                  {stockErrors.map((err, i) => <p key={i}>{err}</p>)}
                  <p className="mt-2 text-xs">Actualiza las cantidades en el carrito antes de continuar.</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-navy mb-1.5">Tipo de ID *</label>
                  <select {...register('billing_id_type')} className="input-field">
                    <option value="CC">Cédula de Ciudadanía</option>
                    <option value="NIT">NIT</option>
                    <option value="CE">Cédula Extranjería</option>
                    <option value="PA">Pasaporte</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-navy mb-1.5">Número de ID *</label>
                  <input {...register('billing_id')} className="input-field" placeholder="1234567890" />
                  {errors.billing_id && <p className="text-red-500 text-xs mt-1">{errors.billing_id.message}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-navy mb-1.5">Nombre completo / Razón Social *</label>
                <input {...register('billing_name')} className="input-field" placeholder="Tu nombre completo" />
                {errors.billing_name && <p className="text-red-500 text-xs mt-1">{errors.billing_name.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-navy mb-1.5">Correo electrónico *</label>
                  <input {...register('billing_email')} type="email" className="input-field" placeholder="tu@correo.com" />
                  {errors.billing_email && <p className="text-red-500 text-xs mt-1">{errors.billing_email.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-navy mb-1.5">Teléfono *</label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 border border-r-0 border-gray-200 rounded-l-xl bg-petfy-grey text-sm text-navy">+57</span>
                    <input {...register('billing_phone')} className="input-field rounded-l-none" placeholder="3001234567" />
                  </div>
                  {errors.billing_phone && <p className="text-red-500 text-xs mt-1">{errors.billing_phone.message}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-navy mb-1.5">Dirección *</label>
                <input {...register('billing_address')} className="input-field" placeholder="Calle 123 # 45-67, Apt 8" />
                {errors.billing_address && <p className="text-red-500 text-xs mt-1">{errors.billing_address.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-navy mb-1.5">Departamento *</label>
                  <select {...register('billing_depto')} className="input-field">
                    <option value="">Seleccionar</option>
                    {COLOMBIA_DEPTOS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  {errors.billing_depto && <p className="text-red-500 text-xs mt-1">{errors.billing_depto.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-navy mb-1.5">Ciudad *</label>
                  <input {...register('billing_city')} className="input-field" placeholder="Medellín" />
                  {errors.billing_city && <p className="text-red-500 text-xs mt-1">{errors.billing_city.message}</p>}
                </div>
              </div>

              {/* Delivery address toggle */}
              <div className="pt-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" {...register('delivery_same')} className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4" />
                  <span className="text-sm font-medium text-navy">Dirección de entrega igual a la de facturación</span>
                </label>
              </div>

              {!deliverySame && (
                <div className="pt-2 space-y-4 border-t border-gray-100">
                  <h3 className="font-semibold text-navy">Dirección de entrega</h3>
                  <input {...register('delivery_address')} className="input-field" placeholder="Dirección de entrega" />
                  <div className="grid grid-cols-2 gap-4">
                    <select {...register('delivery_depto')} className="input-field">
                      <option value="">Departamento</option>
                      {COLOMBIA_DEPTOS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <input {...register('delivery_city')} className="input-field" placeholder="Ciudad" />
                  </div>
                </div>
              )}

              {/* Badge de cobertura */}
              <div className={`flex items-start gap-3 p-4 rounded-xl border ${covColor}`}>
                <CovIcon size={18} className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">{covText}</p>
                  <p className="text-xs mt-0.5 opacity-80">{covSub}</p>
                  {coverageStatus === 'outside' && (
                    <a
                      href="https://wa.me/573177931145?text=Hola%20PetfyCo%2C%20quiero%20verificar%20cobertura%20de%20env%C3%ADo%20a%20mi%20ciudad%20%F0%9F%90%BE"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-2 text-xs font-bold underline"
                    >
                      Consultar por WhatsApp →
                    </a>
                  )}
                </div>
              </div>

              {/* Aceptación legal — Ley 1480 y Ley 1581 */}
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <div>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      {...register('legal_accepted')}
                      className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4 mt-0.5 flex-shrink-0"
                    />
                    <span className="text-sm text-navy">
                      He leído y acepto los{' '}
                      <a href="/terminos" target="_blank" className="text-primary underline font-semibold">
                        Términos y Condiciones
                      </a>
                      {' '}de compra (Ley 1480 — Estatuto del Consumidor) *
                    </span>
                  </label>
                  {errors.legal_accepted && (
                    <p className="text-red-500 text-xs mt-1 ml-7">{errors.legal_accepted.message as string}</p>
                  )}
                </div>
                <div>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      {...register('privacy_accepted')}
                      className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4 mt-0.5 flex-shrink-0"
                    />
                    <span className="text-sm text-navy">
                      Acepto el tratamiento de mis datos personales según la{' '}
                      <a href="/privacidad" target="_blank" className="text-primary underline font-semibold">
                        Política de Privacidad
                      </a>
                      {' '}(Ley 1581 de 2012) *
                    </span>
                  </label>
                  {errors.privacy_accepted && (
                    <p className="text-red-500 text-xs mt-1 ml-7">{errors.privacy_accepted.message as string}</p>
                  )}
                </div>
              </div>

              <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2 py-4">
                Continuar
                <ChevronRight size={18} />
              </button>
            </form>
          )}

          {/* STEP 2: Review */}
          {step === 2 && billingData && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-card p-8">
                <h2 className="text-xl font-bold text-navy mb-5">Revisar Pedido</h2>

                <div className="space-y-4 mb-6">
                  {items.map((item) => {
                    const img = item.product.images?.[0] || 'https://images.unsplash.com/photo-1601758064978-4e9c55a11fcb?w=80&h=80&fit=crop';
                    return (
                      <div key={item.product.id} className="flex gap-4 items-center">
                        <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-petfy-grey flex-shrink-0">
                          <Image src={img} alt={item.product.name} fill className="object-cover" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-navy">{item.product.name}</p>
                          <p className="text-xs text-petfy-grey-text">x{item.quantity}</p>
                        </div>
                        <p className="font-bold text-navy">{formatCOP(item.product.price * item.quantity)}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Delivery options */}
                <div className="border-t border-gray-100 pt-5">
                  <h3 className="font-semibold text-navy mb-3">Opción de entrega</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-4 p-4 rounded-xl border-2 border-primary bg-blue-50">
                      <Truck size={20} className="text-primary flex-shrink-0" />
                      <div className="flex-1">
                        <p className="font-semibold text-navy text-sm">Envío a domicilio</p>
                        <p className="text-xs text-petfy-grey-text">
                          {coverageStatus === 'sabaneta' && 'Sabaneta — mismo día o siguiente día hábil'}
                          {coverageStatus === 'medellin' && 'Medellín — 1 día hábil'}
                          {coverageStatus === 'metro_close' && 'Área metropolitana cercana — 1 a 2 días hábiles'}
                          {coverageStatus === 'metro_far' && 'Área metropolitana — 1 a 2 días hábiles'}
                          {(coverageStatus === 'outside' || coverageStatus === 'unknown') && '1 a 3 días hábiles'}
                        </p>
                      </div>
                      <span className="font-bold text-sm">
                        {isFreeShipping
                          ? <span className="text-green-600">Gratis</span>
                          : <span className="text-navy">{formatCOP(SHIPPING_BY_ZONE[coverageStatus])}</span>
                        }
                      </span>
                    </div>
                    {isFreeShipping && (
                      <div className="flex items-center gap-3 p-4 rounded-xl border-2 border-green-400 bg-green-50">
                        <Check size={20} className="text-green-500" />
                        <p className="text-sm font-semibold text-green-700">¡Envío gratis por compra mayor a $150.000!</p>
                      </div>
                    )}
                    {coverageStatus === 'outside' && (
                      <div className="flex items-start gap-3 p-4 rounded-xl border border-orange-300 bg-orange-50 text-orange-700">
                        <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                        <p className="text-xs">
                          Tu ciudad podría estar fuera de nuestra zona de cobertura habitual (Medellín y área metropolitana).
                          El pedido se creará y te contactaremos por WhatsApp para confirmar el envío.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Billing info summary */}
                <div className="border-t border-gray-100 pt-5 mt-5">
                  <h3 className="font-semibold text-navy mb-3">Datos de facturación</h3>
                  <div className="bg-petfy-grey rounded-xl p-4 text-sm space-y-1">
                    <p className="font-medium">{billingData.billing_name} — {billingData.billing_id_type}: {billingData.billing_id}</p>
                    <p className="text-petfy-grey-text">{billingData.billing_email} | +57 {billingData.billing_phone}</p>
                    <p className="text-petfy-grey-text">{billingData.billing_address}, {billingData.billing_city}, {billingData.billing_depto}</p>
                  </div>
                </div>
              </div>

              {/* Derecho de retracto — Ley 1480 Art. 47 */}
              <div className="flex items-start gap-3 p-4 rounded-xl border border-blue-200 bg-blue-50 text-blue-800 text-xs leading-relaxed">
                <span className="text-lg flex-shrink-0">ℹ️</span>
                <div>
                  <p className="font-semibold mb-0.5">Derecho de retracto (Ley 1480, Art. 47)</p>
                  <p>
                    Tienes derecho a retractarte de la compra dentro de los <strong>5 días hábiles</strong> siguientes a la entrega del producto,
                    sin necesidad de justificación y sin penalización, siempre que el producto no haya sido abierto o dañado.
                    Para ejercer este derecho contáctanos a{' '}
                    <a href="mailto:soporte@petfyco.com" className="underline font-semibold">soporte@petfyco.com</a>{' '}
                    o por WhatsApp.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="btn-secondary flex-1 text-sm py-3.5">
                  Editar datos
                </button>
                <button onClick={() => setStep(3)} className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm py-3.5">
                  Ir al pago
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Payment */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="bg-white rounded-2xl shadow-card p-8">
                <h2 className="text-xl font-bold text-navy mb-6">Método de pago</h2>

                {/* Aviso legal antes del pago — Ley 1480 */}
                <div className="flex items-start gap-3 p-4 rounded-xl bg-gray-50 border border-gray-200 text-xs text-petfy-grey-text leading-relaxed mb-6">
                  <span className="text-base flex-shrink-0">🔒</span>
                  <p>
                    Al completar tu pago confirmas que eres mayor de edad, que has leído y aceptado los{' '}
                    <a href="/terminos" target="_blank" className="text-primary underline font-semibold">Términos y Condiciones</a>{' '}
                    y la{' '}
                    <a href="/privacidad" target="_blank" className="text-primary underline font-semibold">Política de Privacidad</a>{' '}
                    de PetfyCo. Vendedor: <strong>PetfyCo S.A.S.</strong>{process.env.NEXT_PUBLIC_NIT ? ` — NIT ${process.env.NEXT_PUBLIC_NIT}` : ''}.
                    Los precios mostrados incluyen IVA.
                    En cumplimiento de la Ley 1480 (Estatuto del Consumidor) tienes derecho a retracto dentro de los 5 días hábiles posteriores a la entrega.
                  </p>
                </div>

                {/* Wompi */}
                <div className="border-2 border-primary rounded-2xl p-6 mb-4">
                  <div className="flex items-center gap-3 mb-4">
                    <CreditCard size={24} className="text-primary" />
                    <div>
                      <h3 className="font-bold text-navy">Pagar con Wompi</h3>
                      <p className="text-xs text-petfy-grey-text">Tarjeta débito/crédito, PSE, Nequi, Bancolombia</p>
                    </div>
                  </div>
                  <button
                    onClick={() => createOrder('wompi')}
                    disabled={submitting}
                    className="btn-primary w-full py-4 flex items-center justify-center gap-2 text-base"
                  >
                    {submitting ? 'Procesando...' : `Pagar ${formatCOP(orderTotal)} con Wompi`}
                  </button>
                </div>

                {/* Bank Transfer */}
                <div className="border-2 border-gray-200 rounded-2xl p-6">
                  <h3 className="font-bold text-navy mb-3">Transferencia bancaria</h3>
                  <div className="bg-petfy-grey rounded-xl p-4 text-sm space-y-1.5 mb-4">
                    <p><span className="font-semibold">Banco:</span> {process.env.NEXT_PUBLIC_BANK_NAME ?? 'Bancolombia'}</p>
                    <p><span className="font-semibold">Cuenta ahorros:</span> {process.env.NEXT_PUBLIC_BANK_ACCOUNT ?? '—'}</p>
                    <p><span className="font-semibold">NIT:</span> {process.env.NEXT_PUBLIC_BANK_NIT ?? '—'}</p>
                    <p><span className="font-semibold">Titular:</span> {process.env.NEXT_PUBLIC_BANK_HOLDER ?? 'PetfyCo S.A.S.'}</p>
                    <p className="text-petfy-grey-text text-xs mt-2">
                      Envía el comprobante a pagos@petfyco.com con tu número de pedido
                    </p>
                  </div>
                  <button
                    onClick={() => createOrder('transferencia')}
                    disabled={submitting}
                    className="btn-secondary w-full py-3.5 text-sm"
                  >
                    {submitting ? 'Procesando...' : 'Confirmar pedido (pago por transferencia)'}
                  </button>
                </div>
              </div>

              <button onClick={() => setStep(2)} className="text-primary text-sm font-medium hover:text-accent transition-colors">
                ← Volver a revisión
              </button>
            </div>
          )}
        </div>

        {/* Order Summary Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-card p-6 sticky top-24">
            <h3 className="font-bold text-navy mb-4">Tu pedido</h3>
            <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
              {items.map((item) => (
                <div key={item.product.id} className="flex justify-between text-sm">
                  <span className="text-navy line-clamp-1 flex-1 mr-2">{item.product.name} x{item.quantity}</span>
                  <span className="font-medium text-navy flex-shrink-0">{formatCOP(item.product.price * item.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100 pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-petfy-grey-text">Subtotal</span>
                <span className="font-medium">{formatCOP(cartTotal)}</span>
              </div>
              {couponDiscount > 0 && coupon && (
                <div className="flex justify-between text-sm">
                  <span className="text-green-600">Cupón {coupon.code}</span>
                  <span className="font-medium text-green-600">-{formatCOP(couponDiscount)}</span>
                </div>
              )}
              {referralDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-green-600">Referido {referralCode.toUpperCase()}</span>
                  <span className="font-medium text-green-600">-{formatCOP(referralDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-petfy-grey-text">Envío</span>
                <span className={`font-medium ${shipping === 0 ? 'text-green-600' : ''}`}>
                  {shipping === 0 ? 'Gratis' : formatCOP(shipping)}
                </span>
              </div>
              <div className="flex justify-between font-extrabold text-navy text-base pt-2 border-t border-gray-100">
                <span>Total</span>
                <span className="text-primary">{formatCOP(orderTotal)}</span>
              </div>
              {!referralApplied && (
                <div className="pt-2">
                  <p className="text-xs text-petfy-grey-text mb-1.5">¿Tienes un código de referido?</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={referralCode}
                      onChange={(e) => { setReferralCode(e.target.value.toUpperCase()); setReferralApplied(false); setReferralDiscount(0); }}
                      placeholder="CÓDIGO"
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary uppercase"
                      maxLength={12}
                    />
                    <button
                      type="button"
                      onClick={applyReferral}
                      disabled={referralChecking || !referralCode.trim()}
                      className="text-xs bg-primary text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
                    >
                      {referralChecking ? '...' : 'Aplicar'}
                    </button>
                  </div>
                </div>
              )}
              <p className="text-xs text-petfy-grey-text mt-2">Precios incluyen IVA</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
