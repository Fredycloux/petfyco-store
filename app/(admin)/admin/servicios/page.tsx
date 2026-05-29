'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase, formatCOP } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Booking {
  id: string;
  scheduled_at: string;
  address: string;
  pet_name?: string;
  notes?: string;
  status: string;
  created_at: string;
  service?: { name: string; category: string; price: number };
  user?: { email: string };
}

type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'confirmed', label: 'Confirmado', color: 'bg-blue-100 text-blue-800' },
  { value: 'completed', label: 'Completado', color: 'bg-green-100 text-green-800' },
  { value: 'cancelled', label: 'Cancelado', color: 'bg-red-100 text-red-800' },
];

const getStatusColor = (s: string) => STATUS_OPTIONS.find((o) => o.value === s)?.color ?? 'bg-gray-100 text-gray-700';
const getStatusLabel = (s: string) => STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;

export default function AdminServiciosPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  const loadBookings = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('pet_service_bookings')
      .select('*, service:pet_services(name, category, price), user:profiles(email)')
      .order('scheduled_at', { ascending: true });

    if (statusFilter) query = query.eq('status', statusFilter);

    const { data, error } = await query;
    if (error && error.code !== '42P01') {
      toast.error('Error al cargar reservas');
    }
    setBookings(data ?? []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { loadBookings(); }, [loadBookings]);

  const updateStatus = async (id: string, status: BookingStatus) => {
    setUpdating(true);
    const { error } = await supabase
      .from('pet_service_bookings')
      .update({ status })
      .eq('id', id);
    if (error) { toast.error('Error al actualizar'); }
    else { toast.success('Estado actualizado'); loadBookings(); }
    setUpdating(false);
  };

  return (
    <div className="p-6 lg:p-8 max-w-screen-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-navy">Reservas de Servicios</h1>
        <p className="text-petfy-grey-text text-sm mt-1">{bookings.length} reservas</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {[{ value: '', label: 'Todas' }, ...STATUS_OPTIONS].map((s) => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(s.value)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${
              statusFilter === s.value
                ? 'bg-primary text-white'
                : 'bg-white text-navy border border-gray-200 hover:bg-petfy-grey'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-petfy-grey border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-petfy-grey-text uppercase">Servicio</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-petfy-grey-text uppercase">Cliente</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-petfy-grey-text uppercase">Mascota</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-petfy-grey-text uppercase">Fecha</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-petfy-grey-text uppercase">Dirección</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-petfy-grey-text uppercase">Precio</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-petfy-grey-text uppercase">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-5 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : bookings.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-16 text-petfy-grey-text">Sin reservas</td></tr>
              ) : (
                bookings.map((b) => (
                  <tr key={b.id} className="hover:bg-petfy-grey/30 transition-colors">
                    <td className="px-5 py-4 font-semibold text-navy">{b.service?.name ?? '—'}</td>
                    <td className="px-5 py-4 text-petfy-grey-text text-xs">{b.user?.email ?? '—'}</td>
                    <td className="px-5 py-4">{b.pet_name ?? '—'}</td>
                    <td className="px-5 py-4 text-xs text-petfy-grey-text">
                      {new Date(b.scheduled_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-5 py-4 text-xs max-w-[180px] truncate" title={b.address}>{b.address}</td>
                    <td className="px-5 py-4 font-semibold text-navy">
                      {b.service?.price ? formatCOP(b.service.price) : '—'}
                    </td>
                    <td className="px-5 py-4">
                      <div className="relative">
                        <select
                          value={b.status}
                          onChange={(e) => updateStatus(b.id, e.target.value as BookingStatus)}
                          disabled={updating}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-navy focus:outline-none appearance-none pr-5"
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
