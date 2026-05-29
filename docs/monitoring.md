# Monitoreo y alertas — PetfyCo Store

## CI/CD (GitHub Actions)

Workflow `.github/workflows/ci.yml` se ejecuta en cada push a `main`/`clean` y en PRs.

**Secrets a configurar en GitHub → Settings → Secrets and variables → Actions:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Si el build falla → el merge queda bloqueado.

---

## Alertas Vercel

1. Ir a https://vercel.com/dashboard → proyecto `petfyco-store`
2. **Settings → Notifications**
   - Activar: "Deployment Failed" → email a petfyco.sas@gmail.com
   - Activar: "Domain SSL expiring" → email a petfyco.sas@gmail.com
3. **Observability → Speed Insights** — activar para Core Web Vitals
4. **Observability → Web Analytics** — ya activo (GA4 configurado)

---

## Sentry (pendiente — requiere cuenta)

1. Crear cuenta en https://sentry.io (plan gratis cubre PetfyCo)
2. Crear proyecto tipo "Next.js"
3. Copiar DSN y agregar a:
   - `.env.local`: `NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...`
   - Vercel: Settings → Environment Variables → añadir `SENTRY_DSN`
4. Instalar: `npm install @sentry/nextjs`
5. Descomentar el código en `sentry.client.config.ts` y `sentry.server.config.ts`
6. Añadir al `next.config.mjs` el wrapper de Sentry (ver docs oficiales)

**Qué monitorea Sentry:**
- Errores JavaScript en el cliente (checkout, carrito)
- Errores 5xx en API routes
- Performance traces

---

## Supabase

- Dashboard: https://supabase.com/dashboard/project/zziupfzzbcnskhmgotxs
- Logs: https://supabase.com/dashboard/project/zziupfzzbcnskhmgotxs/logs/postgres
- Alertas de uso: Settings → Billing → habilitar alertas de consumo

---

## Uptime

Usar https://uptimerobot.com (gratuito):
1. Crear monitor HTTP(S) → `https://www.petfyco.co`
2. Intervalo: 5 minutos
3. Alerta: email a petfyco.sas@gmail.com si cae > 1 minuto
