import type { Metadata } from "next";
import "./globals.css";
import { getEnvironmentLabel } from "@/lib/environment";
import { getOrgThemeColorSafe } from "@/lib/auth";

export const metadata: Metadata = {
  title: "iOxion — Cricket Auction Platform",
  description: "Online cricket player auctions, IPL-style.",
  manifest: "/manifest.json",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { label, isProd } = getEnvironmentLabel();
  const themeColor = await getOrgThemeColorSafe();

  return (
    <html lang="en">
      <head>
        {themeColor && (
          <style
            // Injected per-org brand color — overrides the --brand default
            // from globals.css. Safe: only ever a hex string from the
            // authenticated user's own org, never user-submitted HTML.
            dangerouslySetInnerHTML={{ __html: `:root { --brand: ${themeColor}; }` }}
          />
        )}
      </head>
      <body className="antialiased">
        {!isProd && (
          <div className="bg-[var(--warning)] text-white text-xs font-semibold text-center py-1 sticky top-0 z-50">
            {label.toUpperCase()} DEPLOYMENT — same database as production, check the org name before acting
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
