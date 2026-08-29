"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { registerSessionAction } from "@/lib/session";
import { Gavel } from "lucide-react";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const wasReplaced = searchParams.get("reason") === "session_replaced";
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      setLoading(false);
      setError(error?.message ?? "Sign in failed.");
      return;
    }

    // Single-session enforcement: this becomes the ONLY valid session for
    // this user — any other browser/device previously logged in as this
    // user will be signed out on its next request.
    const sessionResult = await registerSessionAction(data.user.id, navigator.userAgent);
    setLoading(false);
    if (sessionResult?.error) {
      setError(sessionResult.error);
      return;
    }

    router.push("/");
    router.refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--paper)] px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <Gavel className="text-[var(--brand)]" size={22} />
          <span className="font-semibold text-lg tracking-tight">iOxion</span>
        </div>
        <div className="bg-white border border-[var(--line)] rounded-lg p-6">
          <h1 className="text-lg font-semibold mb-1">Sign in</h1>
          <p className="text-sm text-[var(--ink-soft)] mb-5">Access your auction workspace.</p>
          {wasReplaced && (
            <div className="mb-4 text-xs bg-[var(--brand-soft)] text-[var(--ink-soft)] rounded-md px-3 py-2">
              You were signed out because this account was logged in on another device or browser.
              Only one active session is allowed per account.
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)] mb-1">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-[var(--line)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)] mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-[var(--line)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
              />
            </div>
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-md bg-[var(--brand)] text-white text-sm font-semibold hover:bg-[var(--brand-hover)] transition-colors disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="text-sm text-[var(--ink-soft)] mt-4 text-center">
            No account?{" "}
            <a href="/signup" className="text-[var(--brand)] font-medium hover:underline">
              Sign up
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
