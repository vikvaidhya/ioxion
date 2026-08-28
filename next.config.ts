import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

// withSentryConfig wraps the build to upload source maps to Sentry (so
// stack traces in error reports point to your actual source, not minified
// bundles) and adds a few other Sentry/Next.js integration niceties. It's a
// no-op (harmless) if SENTRY_AUTH_TOKEN isn't set — safe to leave in even
// before you've set up a Sentry project.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: true,
});
