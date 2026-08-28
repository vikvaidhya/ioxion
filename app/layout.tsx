import type { Metadata } from "next";
import "./globals.css";
import { getEnvironmentLabel } from "@/lib/environment";

export const metadata: Metadata = {
  title: "iOxion — Cricket Auction Platform",
  description: "Online cricket player auctions, IPL-style.",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { label, isProd } = getEnvironmentLabel();

  return (
    <html lang="en">
      <body className="antialiased">
        {!isProd && (
          <div className="bg-[#8A5A00] text-white text-xs font-semibold text-center py-1 sticky top-0 z-50">
            {label.toUpperCase()} DEPLOYMENT — same database as production, check the org name before acting
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
