'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Scissors, Stethoscope, Dumbbell, Sparkles, Calendar, MapPin } from 'lucide-react';
import { supabase, formatCOP } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface PetService {
  id: string;
  name: string;
  description?: string;
  price: number;
  duration_minutes?: number;
  category: string;
  image_url?: string;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  grooming: <Scissors size={20} />,
  vet: <Stethoscope size={20} />,
  training: <Dumbbell size={20} />,
  other: <Sparkles size={20} />,
};

const CATEGORY_LABELS: Record<string, string> = {
  grooming: 'Baño y Estética',
  vet: 'Veterinaria',
  training: 'Adiestramiento',
  other: 'Otros',
};

export default function ServiciosPage() {
  const router = useRouter();
  const [services, setServices] = useState<PetService[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PetService | null>(null);
  const [booking, setBooking] = useState(false);
  const [form, setForm] = useState({ pet_name: '', scheduled_at: '', address: '', notes: '' });

  useEffect(() => {
    fetch('/api/servicios')
      .then((r) => r.json())
      .then((data: { services?: PetService[] }) => {
        setServices(data.services ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/auth/login?redirect=/servicios');
      return;
    }

    setBooking(true);
    try {
      const res = await fetch('/api/servicios/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: selected.id, ...form }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Error al reservar');
      }
      toast.success('¡Reserva creada! Te contactaremos para confirmar.');
      setSelected(null);
      setForm({ pet_name: '', scheduled_at: '', address: '', notes: '' });
      router.push('/mis-reservas');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear la reserva');
    } finally {
      setBooking(false);
    }
  };

  const grouped = services.reduce<Record<string, PetService[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-navy">Servicios a Domicilio</h1>
          <p className="text-petfy-grey-text mt-1">Baño, estética, visitas veterinarias y más para tu mascota</p>
        </div>
        <a href="/mis-reservas" className="text-sm font-semibold text-primary hover:underline">
          Mis reservas →
        </a>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-card p-6 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-2/3 mb-3" />
              <div className="h-4 bg-gray-100 rounded w-full mb-2" />
              <div className="h-8 bg-gray-200 rounded-xl mt-4" />
            </div>
          ))}
        </div>
      ) : services.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-card p-16 text-center">
          <p className="text-5xl mb-4">🐾</p>
          <h3 className="text-xl font-bold text-navy mb-2">Próximamente</h3>
          <p className="text-petfy-grey-text">Estamos preparando nuestros servicios a domicilio. ¡Vuelve pronto!</p>
        </div>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-primary">{CATEGORY_ICONS[category]}</span>
              <h2 className="text-xl font-bold text-navy">{CATEGORY_LABELS[category] ?? category}</h2>
            </div>
            <div className={`grid gap-5 ${
              items.length === 4 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' :
              'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
            }`}>
              {items.map((service) => (
                <div key={service.id} className="bg-white rounded-2xl shadow-card flex flex-col overflow-hidden">
                  {service.image_url && (
                    <div className="relative h-40 w-full overflow-hidden bg-petfy-grey">
                      <img
                        src={service.image_url}
                        alt={service.name}
                        className="w-full h-full object-cover"
                        loading="eager"
                      />
                    </div>
                  )}
                  <div className="p-5 flex flex-col flex-1">
                  <h3 className="font-bold text-navy text-lg mb-1">{service.name}</h3>
                  {service.description && (
                    <p className="text-sm text-petfy-grey-text mb-3 flex-1">{service.description}</p>
                  )}
                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100">
                    <div>
                      <p className="text-primary font-bold text-lg">{formatCOP(service.price)}</p>
                      {service.duration_minutes && (
                        <p className="text-xs text-petfy-grey-text">{service.duration_minutes} min</p>
                      )}
                    </div>
                    <button
                      onClick={() => setSelected(service)}
                      className="btn-primary text-sm px-4 py-2"
                    >
                      Reservar
                    </button>
                  </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Booking Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelected(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <h3 className="font-bold text-navy text-xl">{selected.name}</h3>
              <p className="text-primary font-bold">{formatCOP(selected.price)}</p>
            </div>
            <form onSubmit={handleBook} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-navy mb-1">Nombre de tu mascota</label>
                <input
                  type="text"
                  value={form.pet_name}
                  onChange={(e) => setForm((f) => ({ ...f, pet_name: e.target.value }))}
                  className="input-field"
                  placeholder="Ej: Rocky"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-navy mb-1">Fecha y hora *</label>
                <input
                  type="datetime-local"
                  required
                  value={form.scheduled_at}
                  onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
                  className="input-field"
                  min={new Date(Date.now() + 3_600_000).toISOString().slice(0, 16)}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-navy mb-1">
                  <MapPin size={14} className="inline mr-1" />Dirección *
                </label>
                <input
                  type="text"
                  required
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  className="input-field"
                  placeholder="Calle, barrio, Medellín"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-navy mb-1">Notas adicionales</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="input-field resize-none"
                  placeholder="Ej: Perro nervioso, llamar antes de llegar"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setSelected(null)} className="flex-1 btn-secondary">
                  Cancelar
                </button>
                <button type="submit" disabled={booking} className="flex-1 btn-primary">
                  {booking ? 'Reservando...' : 'Confirmar reserva'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
