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
    <div className="min-h-screen flex flex-col bg-[#F9FAFB]">
      <header className="bg-white border-b px-5 py-3 flex items-center justify-between sticky top-0 z-10">
        <Link
          href={user ? "/dashboard" : "/"}
          className="font-bold text-green-700 text-lg tracking-tight"
        >
          Tá Certo?
        </Link>

        <div className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              <span className="hidden sm:block text-gray-400 truncate max-w-[180px]">
                {user.email}
              </span>
              <form action={signOut}>
                <button type="submit" className="text-gray-500 hover:text-gray-700 transition-colors">
                  Sair
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 transition-colors"
            >
              Entrar
            </Link>
          )}
        </div>
      </header>

      <main className="flex-1 px-4 py-8 max-w-2xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
