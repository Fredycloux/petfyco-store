import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase';
import ProductoPageClient from './ProductoPageClient';

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient();
  const { data: product } = await supabase
    .from('store_products')
    .select('name, description, images')
    .eq('slug', params.slug)
    .eq('active', true)
    .single();

  if (!product) {
    return {
      title: 'Producto no encontrado | PetfyCo',
      robots: { index: false },
    };
  }

  const description = product.description
    ? product.description.slice(0, 155) + (product.description.length > 155 ? '…' : '')
    : `Compra ${product.name} con domicilio en Medellín y área metropolitana. PetfyCo.`;

  const image = product.images?.[0];

  return {
    title: `${product.name} | PetfyCo`,
    description,
    openGraph: {
      title: `${product.name} | PetfyCo`,
      description,
      type: 'website',
      locale: 'es_CO',
      ...(image && { images: [{ url: image, alt: product.name }] }),
    },
  };
}

export default async function ProductoPage({ params }: Props) {
  const supabase = createClient();
  const { data: product } = await supabase
    .from('store_products')
    .select('*, category:store_categories(*)')
    .eq('slug', params.slug)
    .eq('active', true)
    .single();
  return <ProductoPageClient initialProduct={product} />;
}
