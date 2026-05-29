'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, SlidersHorizontal, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import ProductCard from '@/components/store/ProductCard';
import type { Product, Category } from '@/lib/types';

const PRODUCTS_PER_PAGE = 12;

type SortOption = 'relevancia' | 'precio_asc' | 'precio_desc' | 'mas_nuevos';

export default function ProductosPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const categoryParam = searchParams.get('category') || '';
  const searchParam = searchParams.get('search') || '';
  const sortParam = (searchParams.get('sort') as SortOption) || 'relevancia';

  const [searchInput, setSearchInput] = useState(searchParam);
  const [selectedCategory, setSelectedCategory] = useState(categoryParam);
  const [sort, setSort] = useState<SortOption>(sortParam);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 500000]);

  useEffect(() => {
    supabase.from('store_categories').select('*').eq('active', true).order('name').then(({ data }) => {
      setCategories(data || []);
    });
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('store_products')
      .select('*, category:store_categories(*)', { count: 'exact' })
      .eq('active', true)
      .gte('price', priceRange[0])
      .lte('price', priceRange[1]);

    if (selectedCategory) {
      const cat = categories.find((c) => c.slug === selectedCategory);
      if (cat) query = query.eq('category_id', cat.id);
    }
    if (searchParam) {
      query = query.ilike('name', `%${searchParam}%`);
    }

    switch (sort) {
      case 'precio_asc':
        query = query.order('price', { ascending: true });
        break;
      case 'precio_desc':
        query = query.order('price', { ascending: false });
        break;
      case 'mas_nuevos':
        query = query.order('created_at', { ascending: false });
        break;
      default:
        query = query.order('featured', { ascending: false }).order('created_at', { ascending: false });
    }

    const from = (page - 1) * PRODUCTS_PER_PAGE;
    query = query.range(from, from + PRODUCTS_PER_PAGE - 1);

    const { data, count } = await query;
    setProducts(data || []);
    setTotal(count || 0);
    setLoading(false);
  }, [selectedCategory, searchParam, sort, priceRange, page, categories]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (searchInput) params.set('search', searchInput);
    if (selectedCategory) params.set('category', selectedCategory);
    if (sort !== 'relevancia') params.set('sort', sort);
    router.push(`/productos?${params.toString()}`);
    setFiltersOpen(false);
    setPage(1);
  };

  const clearFilters = () => {
    setSearchInput('');
    setSelectedCategory('');
    setSort('relevancia');
    setPriceRange([0, 500000]);
    router.push('/productos');
    setPage(1);
  };

  const totalPages = Math.ceil(total / PRODUCTS_PER_PAGE);
  const hasFilters = categoryParam || searchParam || sortParam !== 'relevancia';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-navy mb-2">Catálogo de Productos</h1>
        <p className="text-petfy-grey-text">
          {loading ? 'Cargando...' : `${total} producto${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`}
        </p>
      </div>

      <div className="flex gap-8">
        {/* Sidebar Filters — Desktop */}
        <aside className="hidden lg:block w-64 flex-shrink-0">
          <div className="bg-white rounded-2xl shadow-card p-6 sticky top-24">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-bold text-navy text-lg">Filtros</h2>
              {hasFilters && (
                <button onClick={clearFilters} className="text-xs text-primary hover:text-accent font-medium">
                  Limpiar
                </button>
              )}
            </div>

            {/* Search */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-navy mb-2">Buscar</label>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-petfy-grey-text" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                  placeholder="Nombre del producto"
                  className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {/* Categories */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-navy mb-3">Categoría</label>
              <div className="space-y-2">
                <button
                  onClick={() => setSelectedCategory('')}
                  className={`w-full text-left text-sm py-2 px-3 rounded-lg transition-colors ${
                    selectedCategory === '' ? 'bg-primary text-white font-medium' : 'text-navy hover:bg-petfy-grey'
                  }`}
                >
                  Todas
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.slug)}
                    className={`w-full text-left text-sm py-2 px-3 rounded-lg transition-colors ${
                      selectedCategory === cat.slug ? 'bg-primary text-white font-medium' : 'text-navy hover:bg-petfy-grey'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Price Range */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-navy mb-3">
                Precio máximo: <span className="text-primary">${priceRange[1].toLocaleString('es-CO')}</span>
              </label>
              <input
                type="range"
                min={0}
                max={500000}
                step={10000}
                value={priceRange[1]}
                onChange={(e) => setPriceRange([0, Number(e.target.value)])}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-petfy-grey-text mt-1">
                <span>$0</span>
                <span>$500.000</span>
              </div>
            </div>

            <button onClick={applyFilters} className="btn-primary w-full text-sm py-3">
              Aplicar filtros
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Top Bar */}
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            {/* Mobile filters toggle */}
            <button
              onClick={() => setFiltersOpen(true)}
              className="lg:hidden flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-navy"
            >
              <SlidersHorizontal size={15} />
              Filtros
            </button>

            {/* Sort */}
            <select
              value={sort}
              onChange={(e) => { setSort(e.target.value as SortOption); setPage(1); }}
              className="ml-auto bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="relevancia">Relevancia</option>
              <option value="precio_asc">Precio: Menor a Mayor</option>
              <option value="precio_desc">Precio: Mayor a Menor</option>
              <option value="mas_nuevos">Más Nuevos</option>
            </select>

            {/* Active filters chips */}
            {categoryParam && (
              <div className="flex items-center gap-1.5 bg-primary/10 text-primary rounded-full px-3 py-1.5 text-xs font-medium">
                {categories.find((c) => c.slug === categoryParam)?.name || categoryParam}
                <button onClick={clearFilters}><X size={12} /></button>
              </div>
            )}
            {searchParam && (
              <div className="flex items-center gap-1.5 bg-primary/10 text-primary rounded-full px-3 py-1.5 text-xs font-medium">
                &ldquo;{searchParam}&rdquo;
                <button onClick={clearFilters}><X size={12} /></button>
              </div>
            )}
          </div>

          {/* Products Grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {Array.from({ length: PRODUCTS_PER_PAGE }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl overflow-hidden animate-pulse">
                  <div className="aspect-square bg-gray-200" />
                  <div className="p-4 space-y-3">
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                    <div className="h-10 bg-gray-200 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="bg-white rounded-2xl p-16 text-center shadow-card">
              <p className="text-6xl mb-4">🔍</p>
              <h3 className="text-xl font-bold text-navy mb-2">No encontramos productos</h3>
              <p className="text-petfy-grey-text mb-6">Intenta con otros filtros o busca algo diferente</p>
              <button onClick={clearFilters} className="btn-primary">
                Ver todos los productos
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-10">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-petfy-grey disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .map((p, idx, arr) => (
                  <React.Fragment key={p}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && (
                      <span className="text-petfy-grey-text px-2">...</span>
                    )}
                    <button
                      onClick={() => setPage(p)}
                      className={`w-10 h-10 rounded-xl text-sm font-semibold transition-colors ${
                        p === page
                          ? 'bg-primary text-white'
                          : 'border border-gray-200 text-navy hover:bg-petfy-grey'
                      }`}
                    >
                      {p}
                    </button>
                  </React.Fragment>
                ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-petfy-grey disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Filters Drawer */}
      {filtersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setFiltersOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-80 bg-white overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-bold text-navy text-lg">Filtros</h2>
              <button onClick={() => setFiltersOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-navy mb-2">Buscar</label>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Nombre del producto"
                className="input-field"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-navy mb-3">Categoría</label>
              <div className="space-y-2">
                <button
                  onClick={() => setSelectedCategory('')}
                  className={`w-full text-left text-sm py-2 px-3 rounded-lg transition-colors ${
                    selectedCategory === '' ? 'bg-primary text-white font-medium' : 'text-navy hover:bg-petfy-grey'
                  }`}
                >
                  Todas
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.slug)}
                    className={`w-full text-left text-sm py-2 px-3 rounded-lg transition-colors ${
                      selectedCategory === cat.slug ? 'bg-primary text-white font-medium' : 'text-navy hover:bg-petfy-grey'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={applyFilters} className="btn-primary w-full">
              Aplicar filtros
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
