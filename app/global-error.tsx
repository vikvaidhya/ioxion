"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="min-h-screen flex items-center justify-center bg-[#F6F4EF] px-4">
          <div className="max-w-sm text-center">
            <h1 className="text-lg font-semibold mb-2">Something went wrong</h1>
            <p className="text-sm text-[#8A8372] mb-4">
              This has been reported automatically. Try again, or refresh the page.
            </p>
            <button
              onClick={reset}
              className="px-4 py-2 rounded-md bg-[#1B4332] text-white text-sm font-semibold"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
