"use client";

import { createClient } from "@/lib/supabase/client";
import { useState, use } from "react";

export function LoginForm({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    message?: string;
    reason?: string;
    next?: string;
  }>;
}) {
  const params = use(searchParams);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(
    params.error ? "Link inválido ou expirado. Tente novamente." : ""
  );

  const isQuotaGate = params.reason === "quota";
  const nextPath = params.next ?? "/dashboard";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(nextPath)}`,
      },
    });

    if (authError) {
      setError("Não foi possível enviar o link. Verifique o email e tente novamente.");
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="bg-white rounded-2xl border p-8 text-center shadow-sm">
        <p className="text-3xl mb-3">📬</p>
        <h2 className="font-semibold text-gray-900">Verifique seu email</h2>
        <p className="text-sm text-gray-500 mt-2">
          Enviamos um link de acesso para <strong>{email}</strong>.
          Clique no link para entrar.
        </p>
        <button
          onClick={() => { setSent(false); setEmail(""); }}
          className="mt-5 text-sm text-green-600 underline"
        >
          Usar outro email
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isQuotaGate && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm">
          <p className="font-semibold text-amber-900">Primeira auditoria gratuita usada</p>
          <p className="text-amber-700 mt-0.5">
            Entre na sua conta para continuar auditando seus holerites.
          </p>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl border p-8 shadow-sm space-y-4"
      >
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !email}
          className="w-full rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Enviando…" : "Enviar link de acesso"}
        </button>

        <p className="text-xs text-gray-400 text-center">
          Sem senha. Só clicar no link que chega no email.
        </p>
      </form>
    </div>
  );
}
