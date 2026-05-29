'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';
import { supabase, formatCOP } from '@/lib/supabase';
import type { Order } from '@/lib/types';
import toast from 'react-hot-toast';

type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';

const STATUS_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: '', label: 'Todos', color: '' },
  { value: 'pending', label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'confirmed', label: 'Confirmado', color: 'bg-blue-100 text-blue-800' },
  { value: 'shipped', label: 'Enviado', color: 'bg-purple-100 text-purple-800' },
  { value: 'delivered', label: 'Entregado', color: 'bg-green-100 text-green-800' },
  { value: 'cancelled', label: 'Cancelado', color: 'bg-red-100 text-red-800' },
];

const getStatusColor = (status: string) =>
  STATUS_OPTIONS.find((s) => s.value === status)?.color || 'bg-gray-100 text-gray-700';
const getStatusLabel = (status: string) =>
  STATUS_OPTIONS.find((s) => s.value === status)?.label || status;

export default function PedidosAdminPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [ratings, setRatings] = useState<Record<string, number>>({});

  const loadOrders = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('store_orders')
      .select('*, items:store_order_items(*)')
      .order('created_at', { ascending: false })
      .limit(200); // previene OOM con catálogos grandes

    if (statusFilter) query = query.eq('status', statusFilter);
    if (search) {
      // Escapar % y _ para evitar que el input del usuario sea tratado como
      // comodines de LIKE (ReDoS / resultados inesperados)
      const safe = search.replace(/[%_\\]/g, '\\$&');
      query = query.or(
        `order_number.ilike.%${safe}%,billing_name.ilike.%${safe}%,billing_email.ilike.%${safe}%`
      );
    }
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59');

    const { data } = await query;
    setOrders(data || []);

    // Cargar calificaciones (best-effort — tabla puede no existir aún)
    if (data && data.length > 0) {
      const { data: ratingData, error: rErr } = await supabase
        .from('store_order_ratings')
        .select('order_id, rating')
        .in('order_id', data.map((o) => o.id));
      if (!rErr && ratingData) {
        const map: Record<string, number> = {};
        for (const r of ratingData) map[r.order_id] = r.rating;
        setRatings(map);
      }
    }

    setLoading(false);
  }, [search, statusFilter, dateFrom, dateTo]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const openDetail = async (order: Order) => {
    // Refresh order details
    const { data } = await supabase
      .from('store_orders')
      .select('*, items:store_order_items(*)')
      .eq('id', order.id)
      .single();
    setSelectedOrder(data || order);
    setDetailOpen(true);
  };

  const updateStatus = async (orderId: string, status: OrderStatus) => {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success('Estado actualizado');
      setSelectedOrder((o) => o ? { ...o, status } : null);
      loadOrders();
    } catch {
      toast.error('Error al actualizar');
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-screen-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-navy">Gestión de Pedidos</h1>
        <p className="text-petfy-grey-text text-sm mt-1">{orders.length} pedidos encontrados</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-card p-5 mb-6 flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-petfy-grey-text" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por # pedido, nombre o correo..."
            className="input-field pl-10 text-sm py-2.5"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {STATUS_OPTIONS.map((s) => (
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

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-petfy-grey border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-petfy-grey-text uppercase tracking-wider"># Pedido</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-petfy-grey-text uppercase tracking-wider">Cliente</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-petfy-grey-text uppercase tracking-wider">Total</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-petfy-grey-text uppercase tracking-wider">Estado</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-petfy-grey-text uppercase tracking-wider">Pago</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-petfy-grey-text uppercase tracking-wider">Fecha</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-petfy-grey-text uppercase tracking-wider">Calif.</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-petfy-grey-text uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-5 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-16 text-petfy-grey-text">No se encontraron pedidos</td></tr>
              ) : (
                orders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-petfy-grey/30 transition-colors cursor-pointer"
                    onClick={() => openDetail(order)}
                  >
                    <td className="px-5 py-4 font-bold text-navy">{order.order_number}</td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-navy">{order.billing_name}</p>
                      <p className="text-xs text-petfy-grey-text">{order.billing_email}</p>
                    </td>
                    <td className="px-5 py-4 font-bold text-navy">{formatCOP(order.total)}</td>
                    <td className="px-5 py-4">
                      <span className={`badge ${getStatusColor(order.status)}`}>{getStatusLabel(order.status)}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`badge ${order.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {order.payment_status === 'paid' ? 'Pagado' : order.payment_status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-petfy-grey-text text-xs">
                      {new Date(order.created_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-5 py-4 text-sm">
                      {ratings[order.id]
                        ? '★'.repeat(ratings[order.id]) + '☆'.repeat(5 - ratings[order.id])
                        : <span className="text-petfy-grey-text">—</span>}
                    </td>
                    <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                      <div className="relative">
                        <select
                          value={order.status}
                          onChange={(e) => updateStatus(order.id, e.target.value as OrderStatus)}
                          disabled={updatingStatus}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-navy focus:outline-none focus:ring-1 focus:ring-primary appearance-none pr-6"
                        >
                          {STATUS_OPTIONS.filter((s) => s.value).map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                        <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-petfy-grey-text" />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {detailOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDetailOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-navy text-xl">{selectedOrder.order_number}</h2>
                <p className="text-sm text-petfy-grey-text">
                  {new Date(selectedOrder.created_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <button onClick={() => setDetailOpen(false)} className="p-2 hover:bg-petfy-grey rounded-xl">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Status & actions */}
              <div className="flex items-center justify-between">
                <span className={`badge text-sm px-4 py-2 ${getStatusColor(selectedOrder.status)}`}>
                  {getStatusLabel(selectedOrder.status)}
                </span>
                <div className="flex gap-2">
                  <select
                    value={selectedOrder.status}
                    onChange={(e) => updateStatus(selectedOrder.id, e.target.value as OrderStatus)}
                    disabled={updatingStatus}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {STATUS_OPTIONS.filter((s) => s.value).map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Items */}
              {selectedOrder.items && selectedOrder.items.length > 0 && (
                <div>
                  <h3 className="font-semibold text-navy mb-3">Productos</h3>
                  <div className="space-y-2">
                    {selectedOrder.items.map((item) => (
                      <div key={item.id} className="flex justify-between items-center bg-petfy-grey rounded-xl px-4 py-3 text-sm">
                        <div>
                          <p className="font-medium text-navy">{item.product_name}</p>
                          {item.product_sku && <p className="text-xs text-petfy-grey-text">SKU: {item.product_sku}</p>}
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-navy">{formatCOP(item.subtotal)}</p>
                          <p className="text-xs text-petfy-grey-text">x{item.quantity} × {formatCOP(item.unit_price)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-petfy-grey-text">Subtotal</span>
                      <span>{formatCOP(selectedOrder.subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-petfy-grey-text">Envío</span>
                      <span>{selectedOrder.shipping === 0 ? 'Gratis' : formatCOP(selectedOrder.shipping)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-navy pt-2 border-t border-gray-100">
                      <span>Total</span>
                      <span className="text-primary">{formatCOP(selectedOrder.total)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Billing */}
              <div>
                <h3 className="font-semibold text-navy mb-3">Facturación</h3>
                <div className="bg-petfy-grey rounded-xl p-4 text-sm space-y-1.5">
                  <p><span className="font-medium">{selectedOrder.billing_name}</span> — {selectedOrder.billing_id_type}: {selectedOrder.billing_id}</p>
                  <p className="text-petfy-grey-text">{selectedOrder.billing_email} | +57 {selectedOrder.billing_phone}</p>
                  <p className="text-petfy-grey-text">{selectedOrder.billing_address}, {selectedOrder.billing_city}, {selectedOrder.billing_depto}</p>
                </div>
              </div>

              {/* Delivery */}
              <div>
                <h3 className="font-semibold text-navy mb-3">Entrega</h3>
                <div className="bg-petfy-grey rounded-xl p-4 text-sm">
                  <p className="text-petfy-grey-text">
                    {selectedOrder.delivery_address || selectedOrder.billing_address},
                    {' '}{selectedOrder.delivery_city || selectedOrder.billing_city},
                    {' '}{selectedOrder.delivery_depto || selectedOrder.billing_depto}
                  </p>
                </div>
              </div>

              {/* Payment */}
              <div className="flex items-center justify-between bg-petfy-grey rounded-xl p-4">
                <div>
                  <p className="text-sm font-semibold text-navy">Método de pago</p>
                  <p className="text-sm text-petfy-grey-text capitalize">{selectedOrder.payment_method || '—'}</p>
                </div>
                <span className={`badge ${selectedOrder.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-800'}`}>
                  {selectedOrder.payment_status === 'paid' ? 'Pagado' : selectedOrder.payment_status}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
