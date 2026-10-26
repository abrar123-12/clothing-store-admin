"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// Admin-only sign-in for the separate admin site. Customer accounts are
// rejected here — customers log in on the store itself.
export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!supabase) return setError("Store is not connected yet. Please try again later.");
    setLoading(true);
    const { data, error: e1 } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (e1 || !data.user) { setLoading(false); return setError("Login failed: " + (e1?.message || "check email/password")); }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    setLoading(false);
    if (profile?.role !== "admin") {
      await supabase.auth.signOut();
      return setError("This account is not an admin. Customers log in on the store website.");
    }
    router.push("/panel");
  };

  return (
    <div className="max-w-sm mx-auto px-4 py-10">
      <div className="rounded-2xl bg-gradient-to-r from-amber-500 to-orange-400 p-5 text-white md:p-6">
        <h1 className="text-2xl font-bold">🛍️ KAPOR Admin</h1>
        <p className="mt-1 text-amber-50 text-sm">Store owner only. Dashboard, products, orders — sob ekhane.</p>
      </div>
      <div className="card p-5 mt-4">
        <form onSubmit={login} className="flex flex-col gap-3">
          <div>
            <p className="label">Admin email</p>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Admin email" required />
          </div>
          <div>
            <p className="label">Password</p>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required />
          </div>
          {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          <button disabled={loading} className="btn-primary w-full py-3">{loading ? "Checking..." : "OPEN ADMIN PANEL"}</button>
        </form>
      </div>
      <p className="text-xs text-slate-500 mt-4 text-center">Not an admin? Go to the store website and use the customer login there.</p>
    </div>
  );
}
