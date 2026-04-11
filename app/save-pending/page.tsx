"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getPendingAudit, clearPendingAudit } from "@/lib/utils/audit-quota";

export default function SavePendingPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"saving" | "error">("saving");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function save() {
      const pending = getPendingAudit();
      if (!pending) {
        router.replace("/dashboard");
        return;
      }

      const res = await fetch("/api/auditorias/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analisado: pending.analisado, result: pending.result }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setStatus("error");
        setErrorMsg(body.error ?? "Erro ao salvar auditoria.");
        return;
      }

      const { id } = await res.json() as { id: string };
      clearPendingAudit();
      router.replace(`/audit/${id}`);
    }

    save();
  }, []); // eslint-disable-line

  if (status === "error") {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-2xl">❌</p>
        <p className="font-semibold text-red-700">{errorMsg}</p>
        <button
          onClick={() => router.replace("/resultado")}
          className="text-sm text-green-600 underline"
        >
          Voltar ao resultado
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col items-center justify-center gap-4">
      <div className="animate-spin text-4xl">⏳</div>
      <p className="text-sm text-gray-500">Salvando auditoria…</p>
    </div>
  );
}
