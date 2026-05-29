import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createAdminClient } from '@/lib/supabase';
import { rateLimit, getIp } from '@/lib/rate-limit';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'PetfyCo <onboarding@resend.dev>';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildWelcomeHtml(email: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.petfyco.co';
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#2D7A2D,#1A3D1A);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;letter-spacing:-0.5px;">PetfyCo</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">Nutrición y cuidado para tus mascotas</p>
          </td>
        </tr>

        <!-- Hero -->
        <tr>
          <td style="padding:40px 40px 28px;text-align:center;border-bottom:1px solid #f0f0f0;">
            <div style="font-size:48px;margin-bottom:16px;">🐾</div>
            <h2 style="margin:0 0 10px;color:#1A3D1A;font-size:24px;font-weight:700;">¡Bienvenido a la familia PetfyCo!</h2>
            <p style="margin:0;color:#555;font-size:15px;line-height:1.6;">
              Ya eres parte de nuestra comunidad. A partir de ahora recibirás<br>
              ofertas exclusivas, novedades y consejos para tus mascotas.
            </p>
          </td>
        </tr>

        <!-- Benefits -->
        <tr>
          <td style="padding:28px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7f0;border-radius:12px;padding:24px;">
              <tr><td>
                <p style="margin:0 0 16px;font-size:15px;font-weight:700;color:#1A3D1A;">Como suscriptor tienes acceso a:</p>
                <p style="margin:0 0 10px;font-size:14px;color:#444;">🏷️ <strong>Descuentos exclusivos</strong> en nuestra tienda</p>
                <p style="margin:0 0 10px;font-size:14px;color:#444;">🐕 <strong>Tips de nutrición</strong> y cuidado para perros y gatos</p>
                <p style="margin:0 0 10px;font-size:14px;color:#444;">📦 <strong>Primeras noticias</strong> de nuevos productos</p>
                <p style="margin:0;font-size:14px;color:#444;">⭐ <strong>Promociones especiales</strong> en fechas importantes</p>
              </td></tr>
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:0 40px 36px;text-align:center;">
            <a href="${siteUrl}/productos"
               style="display:inline-block;background:linear-gradient(135deg,#2D7A2D,#1A3D1A);color:#ffffff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:50px;text-decoration:none;letter-spacing:0.3px;">
              Ver productos →
            </a>
            <p style="margin:16px 0 0;font-size:13px;color:#888;">
              ¿No te suscribiste? <a href="mailto:soporte@petfyco.co" style="color:#2D7A2D;">Contáctanos</a> y lo resolvemos.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#1A3D1A;padding:24px 40px;text-align:center;">
            <p style="margin:0;color:rgba(255,255,255,0.7);font-size:12px;">© 2026 PetfyCo · Sabaneta, Antioquia, Colombia</p>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.5);font-size:11px;">
              Recibiste este correo en ${email} porque te suscribiste en <a href="${siteUrl}" style="color:rgba(255,255,255,0.6);">petfyco.co</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(`newsletter:${getIp(req)}`, 3, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes. Intenta en un momento.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetInMs / 1000)) } }
    );
  }

  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });
  }

  const { email } = body;
  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: 'Correo inválido' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Insertar en BD — ignorar duplicados (code 23505)
  const { error: dbError } = await supabase
    .from('store_newsletter')
    .insert({ email: email.toLowerCase().trim() });

  const alreadySubscribed = dbError?.code === '23505';
  if (dbError && !alreadySubscribed) {
    console.error('Newsletter DB error:', dbError.message);
    return NextResponse.json({ error: 'Error al procesar la suscripción' }, { status: 500 });
  }

  // Enviar email de bienvenida solo a suscriptores nuevos
  if (!alreadySubscribed) {
    resend.emails.send({
      from: FROM,
      to: email,
      subject: '¡Bienvenido a PetfyCo! 🐾',
      html: buildWelcomeHtml(email),
    }).catch((err) => {
      console.error('Newsletter welcome email error:', err instanceof Error ? err.message : String(err));
    });
  }

  return NextResponse.json({ ok: true });
}
