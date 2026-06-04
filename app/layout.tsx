import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import { GoogleAnalytics } from '@next/third-parties/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const CANONICAL_ORIGIN = 'https://www.petfyco.co';

export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_ORIGIN),
  title: 'PetfyCo Tienda | Nutrición y Limpieza para Mascotas',
  description:
    'PetfyCo es la tienda en línea especializada en productos premium para mascotas. Nutrición, higiene, accesorios y más con domicilio en Medellín y su área metropolitana.',
  keywords: 'mascotas, perros, gatos, nutrición, higiene, accesorios, Medellín, domicilio, tienda online',
  alternates: { canonical: CANONICAL_ORIGIN },
  icons: { icon: '/favicon.png', apple: '/favicon.png' },
  verification: { google: 'g9rcM0IAHrAp9lNg6fd-W2Z7EtEcK0OVVc_Khkeo8GA' },
  openGraph: {
    title: 'PetfyCo Tienda | Nutrición y Limpieza para Mascotas',
    description: 'Productos premium para tus mascotas con domicilio en Medellín y su área metropolitana.',
    type: 'website',
    locale: 'es_CO',
    url: CANONICAL_ORIGIN,
    siteName: 'PetfyCo',
    images: [{ url: '/logo.png', width: 400, height: 160, alt: 'PetfyCo' }],
  },
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? CANONICAL_ORIGIN;

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'PetfyCo',
      url: SITE_URL,
      logo: `${SITE_URL}/petfyco_nutricion_sin_fondo.png`,
      contactPoint: {
        '@type': 'ContactPoint',
        telephone: '+57-317-793-1145',
        contactType: 'customer service',
        availableLanguage: 'Spanish',
        areaServed: 'CO',
      },
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Medellín',
        addressRegion: 'Antioquia',
        addressCountry: 'CO',
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: 'PetfyCo Tienda',
      description: 'Nutrición, higiene y accesorios premium para mascotas con domicilio en Medellín.',
      publisher: { '@id': `${SITE_URL}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: `${SITE_URL}/productos?search={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  return (
    <html lang="es" className={inter.variable}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {pixelId && (
          <script
            dangerouslySetInnerHTML={{
              __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');fbq('track','PageView');`,
            }}
          />
        )}
      </head>
      <body className="font-sans">
        {children}
        {gaId && <GoogleAnalytics gaId={gaId} />}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#2D2D2D',
              color: '#fff',
              borderRadius: '12px',
              fontSize: '14px',
            },
            success: {
              iconTheme: {
                primary: '#2D7A2D',
                secondary: '#fff',
              },
            },
            error: {
              iconTheme: {
                primary: '#E91E63',
                secondary: '#fff',
              },
            },
          }}
        />
      </body>
    </html>
  );
}
