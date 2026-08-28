"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Gavel } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError || !data.user) {
      setLoading(false);
      setError(signUpError?.message ?? "Could not create account.");
      return;
    }

    // Create the app-level users row. Requires the "users_self_insert" RLS
    // policy (auth_user_id = auth.uid()) — safe to call from the client.
    const { error: profileError } = await supabase.from("users").insert({
      auth_user_id: data.user.id,
      email,
      full_name: fullName,
    });

    setLoading(false);
    if (profileError) {
      setError(profileError.message);
      return;
    }

    // No org membership yet — an Org Admin needs to invite/assign them,
    // or (for MVP) the seed script has already created their membership
    // if their email matches a seeded user.
    router.push("/onboarding");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F6F4EF] px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <Gavel className="text-[#1B4332]" size={22} />
          <span className="font-semibold text-lg tracking-tight">iOxion</span>
        </div>
        <div className="bg-white border border-[#DBD5C7] rounded-lg p-6">
          <h1 className="text-lg font-semibold mb-1">Create account</h1>
          <p className="text-sm text-[#8A8372] mb-5">
            Register as a player, or ask your Org Admin for access.
          </p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-[#8A8372] mb-1">
                Full name
              </label>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-[#DBD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-[#8A8372] mb-1">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-[#DBD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-[#8A8372] mb-1">
                Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-[#DBD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]/30"
              />
            </div>
            {error && <p className="text-sm text-[#7A2E2E]">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-md bg-[#1B4332] text-white text-sm font-semibold hover:bg-[#153726] transition-colors disabled:opacity-60"
            >
              {loading ? "Creating…" : "Create account"}
            </button>
          </form>
          <p className="text-sm text-[#8A8372] mt-4 text-center">
            Already have an account?{" "}
            <a href="/login" className="text-[#1B4332] font-medium hover:underline">
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
