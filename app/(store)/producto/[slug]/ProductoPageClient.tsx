'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { ShoppingCart, Zap, Minus, Plus, ChevronLeft, Package } from 'lucide-react';
import { supabase, formatCOP } from '@/lib/supabase';
import { useCartStore } from '@/lib/cart-store';
import ProductCard from '@/components/store/ProductCard';
import type { Product } from '@/lib/types';
import toast from 'react-hot-toast';

type Tab = 'descripcion' | 'especificaciones';

export default function ProductoPageClient({ initialProduct }: { initialProduct?: Product | null }) {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(initialProduct ?? null);
  const [related, setRelated] = useState<Product[]>([]);
  const [loading, setLoading] = useState(initialProduct == null);
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const [tab, setTab] = useState<Tab>('descripcion');
  const addItem = useCartStore((s) => s.addItem);

  useEffect(() => {
    const load = async () => {
      try {
        let current = initialProduct ?? null;

        if (!current) {
          setLoading(true);
          const { data } = await supabase
            .from('store_products')
            .select('*, category:store_categories(*)')
            .eq('slug', slug)
            .eq('active', true)
            .single();

          if (!data) {
            router.push('/productos');
            return;
          }
          current = data;
          setProduct(data);
          setSelectedImage(0);
          setQuantity(1);
        }

        if (current?.category_id) {
          const { data: rel } = await supabase
            .from('store_products')
            .select('*, category:store_categories(*)')
            .eq('active', true)
            .eq('category_id', current.category_id)
            .neq('id', current.id)
            .limit(4);
          setRelated(rel || []);
        }
      } catch (err) {
        console.error('[ProductoPage] load error:', err);
        if (!initialProduct) router.push('/productos');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug, router, initialProduct]);

  const handleAddToCart = () => {
    if (!product) return;
    addItem(product, quantity);
    toast.success(`${product.name} añadido al carrito`);
  };

  const handleBuyNow = () => {
    if (!product) return;
    addItem(product, quantity);
    router.push('/checkout');
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="animate-pulse grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="aspect-square bg-gray-200 rounded-2xl" />
          <div className="space-y-4">
            <div className="h-8 bg-gray-200 rounded w-3/4" />
            <div className="h-6 bg-gray-200 rounded w-1/2" />
            <div className="h-10 bg-gray-200 rounded w-1/3" />
            <div className="h-24 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) return null;

  const images = product.images?.length > 0
    ? product.images
    : ['https://images.unsplash.com/photo-1601758064978-4e9c55a11fcb?w=600&h=600&fit=crop'];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <nav className="flex items-center gap-2 text-sm text-petfy-grey-text mb-8">
        <button onClick={() => router.push('/productos')} className="flex items-center gap-1 hover:text-primary transition-colors">
          <ChevronLeft size={14} />
          Productos
        </button>
        {product.category && (
          <>
            <span>/</span>
            <button
              onClick={() => router.push(`/productos?category=${product.category!.slug}`)}
              className="hover:text-primary transition-colors"
            >
              {product.category.name}
            </button>
          </>
        )}
        <span>/</span>
        <span className="text-navy font-medium truncate max-w-xs">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
        <div className="space-y-4">
          <div className="relative aspect-square rounded-2xl overflow-hidden bg-petfy-grey">
            <Image
              src={images[selectedImage]}
              alt={product.name}
              fill
              className="object-cover"
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
            {product.stock === 0 && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <span className="bg-white text-navy font-bold px-6 py-3 rounded-2xl text-lg">Agotado</span>
              </div>
            )}
            {product.compare_price && product.compare_price > product.price && (
              <div className="absolute top-4 left-4">
                <span className="bg-petfy-pink text-white font-bold px-3 py-1.5 rounded-xl text-sm">
                  -{Math.round(((product.compare_price - product.price) / product.compare_price) * 100)}% OFF
                </span>
              </div>
            )}
          </div>

          {images.length > 1 && (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedImage(idx)}
                  className={`relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 border-2 transition-all ${
                    selectedImage === idx ? 'border-primary' : 'border-transparent'
                  }`}
                >
                  <Image src={img} alt={`Imagen ${idx + 1}`} fill className="object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          {product.category && (
            <span className="badge bg-primary/10 text-primary mb-3">
              {product.category.name}
            </span>
          )}
          <h1 className="text-3xl font-extrabold text-navy mb-3 leading-tight">{product.name}</h1>

          {product.sku && (
            <p className="text-sm text-petfy-grey-text mb-4">SKU: {product.sku}</p>
          )}

          <div className="flex items-baseline gap-3 mb-4">
            <span className="text-3xl font-extrabold text-navy">{formatCOP(product.price)}</span>
            {product.compare_price && product.compare_price > product.price && (
              <span className="text-lg text-petfy-grey-text line-through">{formatCOP(product.compare_price)}</span>
            )}
          </div>

          <div className="flex items-center gap-2 mb-6">
            <div className={`w-2 h-2 rounded-full ${product.stock > 0 ? 'bg-green-500' : 'bg-red-400'}`} />
            <span className={`text-sm font-medium ${product.stock > 0 ? 'text-green-600' : 'text-red-500'}`}>
              {product.stock === 0
                ? 'Agotado'
                : product.stock <= 5
                ? `Solo ${product.stock} unidades disponibles`
                : `${product.stock} en stock`}
            </span>
          </div>

          {product.stock > 0 && (
            <>
              <div className="flex items-center gap-4 mb-5">
                <span className="text-sm font-semibold text-navy">Cantidad:</span>
                <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="w-11 h-11 flex items-center justify-center hover:bg-petfy-grey transition-colors text-navy"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="w-12 text-center font-bold text-navy text-lg">{quantity}</span>
                  <button
                    onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))}
                    className="w-11 h-11 flex items-center justify-center hover:bg-petfy-grey transition-colors text-navy"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              <div className="flex gap-3 mb-8">
                <button
                  onClick={handleAddToCart}
                  className="flex-1 flex items-center justify-center gap-2 bg-white border-2 border-primary text-primary font-bold py-3.5 rounded-xl hover:bg-primary hover:text-white transition-colors"
                >
                  <ShoppingCart size={18} />
                  Añadir al carrito
                </button>
                <button
                  onClick={handleBuyNow}
                  className="flex-1 flex items-center justify-center gap-2 btn-primary py-3.5"
                >
                  <Zap size={18} />
                  Comprar ahora
                </button>
              </div>
            </>
          )}

          <div className="bg-petfy-grey rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-3 text-sm text-navy">
              <Package size={16} className="text-primary flex-shrink-0" />
              <span>Domicilio en Medellín y área metropolitana — Gratis en compras {'>'} $150.000</span>
            </div>
          </div>

          {product.tags && product.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-5">
              {product.tags.map((tag) => (
                <span key={tag} className="badge bg-petfy-grey text-navy">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mb-16">
        <div className="flex gap-1 bg-petfy-grey rounded-xl p-1 w-fit mb-6">
          {(['descripcion', 'especificaciones'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all capitalize ${
                tab === t ? 'bg-white text-navy shadow-sm' : 'text-petfy-grey-text hover:text-navy'
              }`}
            >
              {t === 'descripcion' ? 'Descripción' : 'Especificaciones'}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-card p-8">
          {tab === 'descripcion' ? (
            <div className="prose max-w-none text-navy">
              {product.description ? (
                <p className="leading-relaxed text-petfy-grey-text whitespace-pre-wrap">{product.description}</p>
              ) : (
                <p className="text-petfy-grey-text italic">No hay descripción disponible.</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {[
                { label: 'Nombre', value: product.name },
                { label: 'SKU', value: product.sku || '—' },
                { label: 'Categoría', value: product.category?.name || '—' },
                { label: 'Stock', value: `${product.stock} unidades` },
              ].map(({ label, value }) => (
                <div key={label} className="flex gap-4 py-3 border-b border-gray-100 last:border-0">
                  <span className="w-32 text-sm font-semibold text-navy flex-shrink-0">{label}</span>
                  <span className="text-sm text-petfy-grey-text">{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section>
          <h2 className="text-2xl font-extrabold text-navy mb-6">También te puede interesar</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
