'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Check, Gift } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface ReferralData {
  code: string;
  uses_count: number;
  discount_percent: number;
}

export default function CuentaPage() {
  const router = useRouter();
  const [referral, setReferral] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/auth/login?redirect=/cuenta'); return; }
      setLoading(false);
    });
  }, [router]);

  const generateCode = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/referrals/generate', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Error al generar código');
      }
      const data = await res.json() as ReferralData;
      setReferral(data);
      toast.success('¡Código de referido creado!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setGenerating(false);
    }
  };

  const copyCode = () => {
    if (!referral) return;
    navigator.clipboard.writeText(referral.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('¡Código copiado!');
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 flex justify-center">
        <div className="animate-pulse text-petfy-grey-text">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-3xl font-extrabold text-navy mb-8">Mi Cuenta</h1>

      {/* Referral Section */}
      <div className="bg-white rounded-2xl shadow-card p-6 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
            <Gift size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="font-bold text-navy text-lg">Tu código de referido</h2>
            <p className="text-sm text-petfy-grey-text">Compártelo y tus amigos reciben 10% de descuento</p>
          </div>
        </div>

        {referral ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-petfy-grey rounded-xl px-5 py-3 font-mono text-2xl font-bold text-navy text-center tracking-widest">
                {referral.code}
              </div>
              <button
                onClick={copyCode}
                className="p-3 rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors"
                aria-label="Copiar código"
              >
                {copied ? <Check size={20} /> : <Copy size={20} />}
              </button>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="text-petfy-grey-text">Usos:</span>{' '}
                <span className="font-semibold text-navy">{referral.uses_count}</span>
              </div>
              <div>
                <span className="text-petfy-grey-text">Descuento:</span>{' '}
                <span className="font-semibold text-primary">{referral.discount_percent}%</span>
              </div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
              <p className="font-semibold mb-1">¿Cómo funciona?</p>
              <p>Comparte tu código. Quien lo use en el checkout recibe {referral.discount_percent}% de descuento en su primera compra. ¡Es así de fácil!</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-petfy-grey-text mb-4 text-sm">Aún no tienes un código de referido.</p>
            <button
              onClick={generateCode}
              disabled={generating}
              className="btn-primary"
            >
              {generating ? 'Generando...' : 'Crear mi código'}
            </button>
          </div>
        )}
      </div>

      {/* Pedidos link */}
      <div className="bg-white rounded-2xl shadow-card p-5 flex items-center justify-between">
        <div>
          <p className="font-semibold text-navy">Mis Pedidos</p>
          <p className="text-sm text-petfy-grey-text">Consulta el estado de tus compras</p>
        </div>
        <a href="/pedidos" className="btn-primary text-sm">
          Ver pedidos →
        </a>
      </div>
    </div>
  );
}
