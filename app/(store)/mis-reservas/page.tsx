'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, MapPin, Clock } from 'lucide-react';
import { supabase, formatCOP } from '@/lib/supabase';

interface Booking {
  id: string;
  scheduled_at: string;
  address: string;
  pet_name?: string;
  notes?: string;
  status: string;
  created_at: string;
  service?: { name: string; category: string; price: number };
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:   { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: 'Confirmado', color: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Completado', color: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800' },
};

export default function MisReservasPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/auth/login?redirect=/mis-reservas'); return; }

      const res = await fetch('/api/servicios/bookings');
      if (res.ok) {
        const data = await res.json() as { bookings?: Booking[] };
        setBookings(data.bookings ?? []);
      }
      setLoading(false);
    };
    init();
  }, [router]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl shadow-card p-6 animate-pulse h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-3xl font-extrabold text-navy">Mis Reservas</h1>
        <a href="/servicios" className="btn-primary text-sm">
          + Nueva reserva
        </a>
      </div>

      {bookings.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-card p-16 text-center">
          <p className="text-5xl mb-4">📅</p>
          <h3 className="text-xl font-bold text-navy mb-2">Sin reservas aún</h3>
          <p className="text-petfy-grey-text mb-6">Agenda un servicio a domicilio para tu mascota.</p>
          <a href="/servicios" className="btn-primary">Ver servicios</a>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((b) => {
            const status = STATUS_LABELS[b.status] ?? { label: b.status, color: 'bg-gray-100 text-gray-700' };
            return (
              <div key={b.id} className="bg-white rounded-2xl shadow-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-bold text-navy">{b.service?.name ?? 'Servicio'}</p>
                      <span className={`badge ${status.color}`}>{status.label}</span>
                    </div>
                    {b.pet_name && (
                      <p className="text-sm text-petfy-grey-text mb-2">🐾 {b.pet_name}</p>
                    )}
                    <div className="flex flex-wrap gap-4 text-sm text-petfy-grey-text">
                      <span className="flex items-center gap-1">
                        <Calendar size={14} />
                        {new Date(b.scheduled_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={14} />
                        {new Date(b.scheduled_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin size={14} />
                        {b.address}
                      </span>
                    </div>
                  </div>
                  {b.service?.price && (
                    <p className="font-bold text-primary text-lg flex-shrink-0">{formatCOP(b.service.price)}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
