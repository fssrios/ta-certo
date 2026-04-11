import { LoginForm } from "@/components/auth/LoginForm";
import Link from "next/link";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; reason?: string; next?: string }>;
}) {
  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <Link href="/" className="text-2xl font-bold text-green-700">
          Tá Certo?
        </Link>
        <p className="mt-2 text-sm text-gray-500">
          Acesse com seu email — sem senha necessária
        </p>
      </div>

      <LoginForm searchParams={searchParams} />
    </div>
  );
}
