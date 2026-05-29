'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ShoppingCart, Search, User, Menu, X, LogOut } from 'lucide-react';
import { useCartStore } from '@/lib/cart-store';
import { supabase, isAdmin } from '@/lib/supabase';
import CartDrawer from './CartDrawer';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [user, setUser] = useState<{ email?: string | null } | null>(null);
  const [admin, setAdmin] = useState(false);
  const router = useRouter();
  const itemCount = useCartStore((s) => s.itemCount());

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setUser(data.session.user);
        setAdmin(isAdmin(data.session.user.email));
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAdmin(isAdmin(session?.user?.email));
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/productos?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery('');
    }
  };

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 bg-white transition-all duration-200 ${
          scrolled ? 'shadow-lg' : 'shadow-sm'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-[72px] md:h-[110px] overflow-hidden">

            {/* Logo */}
            <Link href="/" className="flex items-center flex-shrink-0">
              <div className="relative" style={{ height: 'clamp(60px, 8vw, 100px)', width: 'clamp(120px, 16vw, 200px)' }}>
                <Image
                  src="/petfyco_nutricion_sin_fondo.png"
                  alt="PetfyCo"
                  fill
                  priority
                  className="object-contain"
                  style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2)) contrast(1.1)' }}
                />
              </div>
            </Link>

            {/* Desktop Nav Links */}
            <div className="hidden md:flex items-center gap-8">
              <Link href="/" className="text-navy font-semibold hover:text-primary transition-colors text-sm">
                Inicio
              </Link>
              <Link href="/productos" className="text-navy font-semibold hover:text-primary transition-colors text-sm">
                Productos
              </Link>
              <Link href="/servicios" className="text-navy font-semibold hover:text-primary transition-colors text-sm">
                Servicios
              </Link>
              <Link href="/#nosotros" className="text-navy font-semibold hover:text-primary transition-colors text-sm">
                Nosotros
              </Link>
              <Link href="/contacto" className="text-navy font-semibold hover:text-primary transition-colors text-sm">
                Contacto
              </Link>
              {admin && (
                <Link
                  href="/admin"
                  className="bg-accent text-white text-sm font-bold px-4 py-1.5 rounded-full hover:opacity-90 transition-opacity"
                >
                  ⚙ Admin
                </Link>
              )}
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-1">
              {/* Search */}
              <button
                onClick={() => setSearchOpen(!searchOpen)}
                className="p-2.5 rounded-xl hover:bg-petfy-grey transition-colors text-navy"
                aria-label="Buscar"
              >
                <Search size={20} />
              </button>

              {/* Cart */}
              <button
                onClick={() => setCartOpen(true)}
                className="p-2.5 rounded-xl hover:bg-petfy-grey transition-colors text-navy relative"
                aria-label="Carrito"
              >
                <ShoppingCart size={20} />
                {itemCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-accent text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center leading-none">
                    {itemCount > 9 ? '9+' : itemCount}
                  </span>
                )}
              </button>

              {/* User */}
              {user ? (
                <div className="hidden md:flex items-center gap-1">
                  <Link
                    href="/pedidos"
                    className="p-2.5 rounded-xl hover:bg-petfy-grey transition-colors text-navy"
                    title={user.email ?? ''}
                  >
                    <User size={20} />
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="p-2.5 rounded-xl hover:bg-petfy-grey transition-colors text-petfy-grey-text"
                    title="Cerrar sesión"
                  >
                    <LogOut size={18} />
                  </button>
                </div>
              ) : (
                <Link
                  href="/auth/login"
                  className="hidden md:flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-full text-sm font-bold hover:bg-opacity-90 transition-all ml-1"
                >
                  <User size={15} />
                  Ingresar
                </Link>
              )}

              {/* Mobile menu toggle */}
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="md:hidden p-2.5 rounded-xl hover:bg-petfy-grey transition-colors text-navy"
                aria-label="Menú"
              >
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>

          {/* Search bar */}
          {searchOpen && (
            <div className="pb-3 -mt-1">
              <form onSubmit={handleSearch} className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar productos..."
                  className="w-full border-2 border-primary/30 rounded-full pl-5 pr-12 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors"
                  autoFocus
                />
                <button
                  type="submit"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-primary"
                >
                  <Search size={18} />
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Mobile Menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-4 py-4 space-y-1">
            {[
              { href: '/', label: 'Inicio' },
              { href: '/productos', label: 'Productos' },
              { href: '/servicios', label: 'Servicios' },
              { href: '/#nosotros', label: 'Nosotros' },
              { href: '/contacto', label: 'Contacto' },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="block text-navy font-semibold py-2.5 px-3 rounded-xl hover:bg-petfy-grey hover:text-primary transition-colors"
                onClick={() => setMenuOpen(false)}
              >
                {label}
              </Link>
            ))}
            {admin && (
              <Link
                href="/admin"
                className="block text-accent font-bold py-2.5 px-3 rounded-xl hover:bg-orange-50"
                onClick={() => setMenuOpen(false)}
              >
                ⚙ Admin
              </Link>
            )}
            <div className="pt-3 border-t border-gray-100">
              {user ? (
                <div className="flex items-center gap-3">
                  <Link href="/pedidos" className="flex-1 text-center text-sm font-semibold text-primary py-2.5 border-2 border-primary rounded-full" onClick={() => setMenuOpen(false)}>
                    Mis Pedidos
                  </Link>
                  <button onClick={handleLogout} className="p-2 text-petfy-grey-text">
                    <LogOut size={18} />
                  </button>
                </div>
              ) : (
                <Link
                  href="/auth/login"
                  className="block text-center text-sm font-bold bg-primary text-white py-3 rounded-full"
                  onClick={() => setMenuOpen(false)}
                >
                  Ingresar
                </Link>
              )}
            </div>
          </div>
        )}
        {/* Barra inferior verde */}
        <div className="bg-gradient-to-r from-primary via-[#3d9e3d] to-accent h-[3px] w-full" />
      </nav>

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  );
}
