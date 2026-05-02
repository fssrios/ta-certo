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
      <div className="bg-tc-paper border-[1.5px] border-tc-green rounded-2xl p-6 flex items-start gap-4">
        <div className="w-10 h-10 bg-tc-green text-tc-paper rounded-xl grid place-items-center flex-shrink-0">
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <div className="font-display text-xl font-medium">Link enviado</div>
          <div className="text-sm text-tc-muted mt-1">
            Confira <strong className="text-tc-ink">{email || "seu e-mail"}</strong> — expira em 15 minutos.
          </div>
          <button
            className="mt-3 text-sm text-tc-accent font-semibold hover:underline"
            onClick={() => { setSent(false); setEmail(""); }}
          >
            Usar outro email
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="email" className="block text-sm font-semibold mb-2">
          E-mail
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@email.com"
          required
          autoFocus
          className="w-full px-4 py-3.5 border-[1.5px] border-tc-line bg-tc-paper rounded-xl text-sm outline-none focus:border-tc-green transition-colors font-body"
        />
      </div>

      {error && (
        <div className="text-sm text-tc-coral bg-tc-coral/10 border border-tc-coral/30 rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !email}
        className="w-full bg-tc-green text-tc-paper rounded-full py-3.5 text-sm font-semibold hover:bg-[#245038] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? "Enviando…" : (
          <>
            Enviar link seguro
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </>
        )}
      </button>
    </form>
  );
}
