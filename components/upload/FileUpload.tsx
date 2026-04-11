"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Step = "idle" | "uploading" | "ocr" | "ai" | "auditing" | "done" | "error";

const STEP_LABELS: Record<Step, string> = {
  idle: "",
  uploading: "Salvando imagem…",
  ocr: "Extraindo texto (OCR)…",
  ai: "Interpretando holerite com IA…",
  auditing: "Calculando divergências CLT…",
  done: "Pronto!",
  error: "Erro",
};

/** Converte File para base64 usando FileReader (funciona no browser sem Buffer) */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Remove o prefixo "data:image/jpeg;base64,"
      resolve(dataUrl.split(",")[1]);
    };
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
  });
}

export function FileUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  async function processFile(file: File) {
    setError("");
    setStep("uploading");

    const mimeType = file.type || "image/jpeg";
    const base64 = await fileToBase64(file);

    // 1. Criar registro no banco
    const supabase = createClient();
    const { data: auditRow, error: insertError } = await supabase
      .from("audits")
      .insert({ status: "processing" })
      .select("id")
      .single();

    if (insertError || !auditRow) {
      setStep("error");
      setError("Erro ao criar registro. Verifique sua conexão e tente novamente.");
      return;
    }

    const auditId = auditRow.id as string;

    // 2. Upload no Storage
    const { error: storageError } = await supabase.storage
      .from("holerites")
      .upload(`${auditId}/original`, file, { contentType: mimeType });

    if (storageError) {
      setStep("error");
      setError("Erro ao fazer upload da imagem.");
      return;
    }

    // 3. OCR via Google Cloud Vision
    setStep("ocr");
    const ocrRes = await fetch("/api/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64, mimeType }),
    });

    if (!ocrRes.ok) {
      const body = await ocrRes.json().catch(() => ({}));
      setStep("error");
      setError(body.error ?? "Erro no OCR. Tente uma foto com mais luz e resolução.");
      return;
    }

    const { rawText } = (await ocrRes.json()) as { rawText: string };
    await supabase.from("audits").update({ raw_text: rawText }).eq("id", auditId);

    // 4. Interpretar com Claude
    setStep("ai");
    const interpretRes = await fetch("/api/interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText }),
    });

    if (!interpretRes.ok) {
      const body = await interpretRes.json().catch(() => ({}));
      setStep("error");
      setError(body.error ?? "Não foi possível interpretar o holerite. Tente uma imagem mais nítida.");
      return;
    }

    const { parsedData } = await interpretRes.json();

    // 5. Motor CLT — calcular divergências
    setStep("auditing");
    const auditRes = await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auditId, parsedData }),
    });

    if (!auditRes.ok) {
      setStep("error");
      setError("Erro ao calcular divergências.");
      return;
    }

    setStep("done");
    router.push(`/audit/${auditId}`);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    processFile(file);
  }

  const isProcessing = step !== "idle" && step !== "error";

  return (
    <div className="space-y-6">
      {/* Área de drop / clique */}
      <div
        onClick={() => !isProcessing && inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-colors ${
          isProcessing
            ? "border-green-300 bg-green-50 cursor-not-allowed"
            : "border-gray-300 bg-white hover:border-green-400 hover:bg-green-50 cursor-pointer"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
          capture="environment"
        />

        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Preview do holerite"
            className="max-h-48 mx-auto rounded-lg object-contain"
          />
        ) : (
          <div className="space-y-2">
            <p className="text-4xl">📄</p>
            <p className="font-medium text-gray-700">
              Toque para fotografar ou selecionar imagem
            </p>
            <p className="text-sm text-gray-400">JPEG, PNG ou WebP · máx. 10 MB</p>
          </div>
        )}
      </div>

      {/* Status do processamento */}
      {step !== "idle" && (
        <div className="bg-white border rounded-xl px-5 py-4">
          {step === "error" ? (
            <div className="flex items-start gap-3">
              <span className="text-red-500 text-lg flex-shrink-0">✕</span>
              <div>
                <p className="font-medium text-red-700">Algo deu errado</p>
                <p className="text-sm text-gray-500 mt-0.5">{error}</p>
                <button
                  onClick={() => {
                    setStep("idle");
                    setPreview(null);
                    setError("");
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                  className="mt-3 text-sm text-green-600 underline"
                >
                  Tentar novamente
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {(["uploading", "ocr", "ai", "auditing"] as const).map((s) => {
                const isDone =
                  ["uploading", "ocr", "ai", "auditing"].indexOf(s) <
                  ["uploading", "ocr", "ai", "auditing"].indexOf(step);
                const isCurrent = s === step;
                return (
                  <div key={s} className="flex items-center gap-3">
                    <span
                      className={`w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full text-xs ${
                        isDone
                          ? "bg-green-500 text-white"
                          : isCurrent
                          ? "border-2 border-green-500 border-t-transparent animate-spin"
                          : "border-2 border-gray-200"
                      }`}
                    >
                      {isDone ? "✓" : ""}
                    </span>
                    <p
                      className={`text-sm ${
                        isCurrent ? "font-medium text-gray-800" : "text-gray-400"
                      }`}
                    >
                      {STEP_LABELS[s]}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
