import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// TODO: instalar firebase-admin con: npm install firebase-admin
// TODO: agregar FIREBASE_SERVICE_ACCOUNT_KEY a .env.local y Vercel con el JSON del Service Account de Firebase

export async function POST(req: NextRequest) {
  // Solo acepta llamadas internas
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret || req.headers.get('x-internal-secret') !== internalSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    // Silencioso en producción hasta que Fredy configure Firebase Admin
    console.warn('[notifications] FIREBASE_SERVICE_ACCOUNT_KEY no configurado — notificación omitida');
    return NextResponse.json({ ok: true, skipped: true });
  }

  let body: { user_id?: string; title?: string; body?: string; data?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { user_id, title, body: notifBody } = body;
  if (!user_id || !title || !notifBody) {
    return NextResponse.json({ error: 'user_id, title y body son requeridos' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('fcm_token')
    .eq('id', user_id)
    .maybeSingle();

  if (!profile?.fcm_token) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'no_token' });
  }

  try {
    // TODO: reemplazar con firebase-admin una vez instalado
    // const { initializeApp, cert, getApps } = await import('firebase-admin/app');
    // const { getMessaging } = await import('firebase-admin/messaging');
    // if (!getApps().length) {
    //   initializeApp({ credential: cert(JSON.parse(serviceAccountKey)) });
    // }
    // await getMessaging().send({
    //   token: profile.fcm_token,
    //   notification: { title, body: notifBody },
    //   data: body.data,
    //   android: { priority: 'high' },
    // });

    console.log(`[notifications] Notificación pendiente para ${user_id}: ${title}`);
    return NextResponse.json({ ok: true, pending: true });
  } catch (err) {
    console.error('[notifications] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: true, skipped: true, reason: 'send_error' });
  }
}
