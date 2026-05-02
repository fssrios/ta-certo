import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import Link from "next/link";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen flex flex-col bg-tc-bg">
      <header className="bg-tc-paper border-b border-tc-line px-5 sm:px-10 py-4 flex items-center justify-between sticky top-0 z-10">
        <Link
          href={user ? "/dashboard" : "/"}
          className="flex items-center gap-3"
        >
          <div className="w-8 h-8 bg-tc-green text-tc-paper rounded-lg grid place-items-center font-display font-semibold text-base">
            tc
          </div>
          <span className="font-display text-lg font-medium tracking-tight">Tá Certo.</span>
        </Link>

        <div className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              <span className="hidden sm:block text-tc-muted text-xs truncate max-w-[180px]">
                {user.email}
              </span>
              <Link
                href="/audit/new"
                className="bg-tc-green text-tc-paper rounded-full px-4 py-2 text-xs font-semibold hover:bg-[#245038] transition-colors"
              >
                + Novo holerite
              </Link>
              <form action={signOut}>
                <button type="submit" className="text-tc-muted hover:text-tc-ink text-xs transition-colors">
                  Sair
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="bg-tc-green text-tc-paper rounded-full px-4 py-2 text-xs font-semibold hover:bg-[#245038] transition-colors"
            >
              Entrar
            </Link>
          )}
        </div>
      </header>

      <main className="flex-1 px-4 py-10 max-w-3xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
