import { LoginForm } from "@/components/auth/LoginForm";
import Link from "next/link";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; reason?: string; next?: string }>;
}) {
  return (
    <>
      {/* Logo */}
      <Link href="/" className="flex items-center gap-3">
        <div className="w-9 h-9 bg-tc-green text-tc-paper rounded-xl grid place-items-center font-display font-semibold text-lg">
          tc
        </div>
        <span className="font-display text-xl font-medium tracking-tight">Tá Certo.</span>
      </Link>

      {/* Form area */}
      <div className="max-w-sm w-full mx-auto md:mx-0">
        <div className="text-xs tracking-widest text-tc-accent font-bold mb-5">ENTRAR</div>
        <h1 className="font-display text-5xl sm:text-6xl font-normal leading-[1] tracking-tight mb-4">
          Bem-vinda<br /><em>de volta.</em>
        </h1>
        <p className="text-base text-[var(--tc-ink-soft)] leading-relaxed mb-8">
          Sem senha. Mandamos um link seguro pro seu e-mail — você clica e já está dentro.
        </p>
        <LoginForm searchParams={searchParams} />
        <p className="mt-5 text-center text-sm text-tc-muted">
          Novo por aqui?{" "}
          <Link href="/audit/new" className="text-tc-accent font-semibold hover:underline">
            Confira um holerite sem cadastro
          </Link>
        </p>
      </div>

      {/* Footer */}
      <p className="text-xs text-tc-muted leading-relaxed max-w-sm">
        Ao continuar você aceita os{" "}
        <Link href="/termos" className="text-tc-ink underline">termos</Link>{" "}
        e a{" "}
        <Link href="/privacidade" className="text-tc-ink underline">política de privacidade</Link>.
        Seus dados nunca são compartilhados com seu empregador.
      </p>
    </>
  );
}
