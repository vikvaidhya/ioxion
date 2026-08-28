import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Lower this in production if bid volume is high — 1.0 captures every
  // transaction, which is fine at MVP scale (≤300 players, low traffic)
  // but worth tuning down (e.g. 0.2) once this handles many concurrent orgs.
  tracesSampleRate: 1.0,
  // Only report errors when a DSN is actually configured — keeps local dev
  // silent instead of erroring on a missing DSN.
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});
