"use client";

import { useState, useRef, useCallback, DragEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { analisadoParaParsed } from "@/lib/converters/analyzed-to-parsed";
import {
  hasUsedFreeAudit,
  incrementAuditCount,
  savePendingAudit,
} from "@/lib/utils/audit-quota";
import { trackAuditCompleted } from "@/lib/analytics";
import type { HoleriteAnalisado, AuditResult } from "@/lib/types";

// ── Tipos ──────────────────────────────────────────────────────────────────

type UIState = "idle" | "preview" | "processing" | "error";

type ProcessStep = "ocr" | "analyze" | "audit";

const STEP_LABEL: Record<ProcessStep, string> = {
  ocr: "Extraindo texto (OCR)…",
  analyze: "Interpretando holerite com IA…",
  audit: "Calculando divergências CLT…",
};

const STEPS: ProcessStep[] = ["ocr", "analyze", "audit"];

// ── PDF → JPEG (client-side, pdfjs-dist dinâmico) ─────────────────────────

async function pdfParaJpegBase64(file: File): Promise<{ base64: string; previewUrl: string }> {
  const pdfjsLib = await import("pdfjs-dist");

  // Worker: usa o arquivo do pacote diretamente via URL do CDN correspondente à versão instalada
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);

  // scale 2.0 → resolução maior para melhorar qualidade do OCR
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvasContext: canvas.getContext("2d") as CanvasRenderingContext2D,
    canvas,
    viewport,
  }).promise;

  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  return { base64: dataUrl.split(",")[1], previewUrl: dataUrl };
}

// ── Converte qualquer arquivo aceito em { base64, mimeType, previewUrl } ──

async function fileParaBase64(file: File): Promise<{
  base64: string;
  mimeType: string;
  previewUrl: string;
}> {
  if (file.type === "application/pdf") {
    const { base64, previewUrl } = await pdfParaJpegBase64(file);
    return { base64, mimeType: "image/jpeg", previewUrl };
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve({
        base64: dataUrl.split(",")[1],
        mimeType: file.type || "image/jpeg",
        previewUrl: dataUrl,
      });
    };
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
  });
}

// ── Componente ─────────────────────────────────────────────────────────────

export function ImageUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const [uiState, setUiState] = useState<UIState>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<ProcessStep | null>(null);
  const [completedSteps, setCompletedSteps] = useState<ProcessStep[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  // ── Seleção de arquivo ──────────────────────────────────────────────────

  function handleFileSelected(file: File) {
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type)) {
      setErrorMessage("Formato não suportado. Use JPEG, PNG, WebP ou PDF.");
      setUiState("error");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setErrorMessage("Arquivo muito grande. Máximo: 15 MB.");
      setUiState("error");
      return;
    }

    setSelectedFile(file);

    // Preview rápido — para PDF usa ícone; para imagem, blob URL
    if (file.type === "application/pdf") {
      setPreviewUrl(null); // mostra ícone PDF
    } else {
      setPreviewUrl(URL.createObjectURL(file));
    }
    setUiState("preview");
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
    // Reseta o input para permitir selecionar o mesmo arquivo novamente
    e.target.value = "";
  }

  // ── Drag & Drop ─────────────────────────────────────────────────────────

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelected(file);
  }, []); // eslint-disable-line

  // ── Pipeline de análise ─────────────────────────────────────────────────

  async function handleAnalisar() {
    if (!selectedFile) return;

    // Verifica quota antes de começar
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const isAnon = !session;

    if (isAnon && hasUsedFreeAudit()) {
      router.push("/login?reason=quota");
      return;
    }

    setUiState("processing");
    setCompletedSteps([]);
    setErrorMessage("");

    // Converte arquivo para base64
    let base64: string;
    let mimeType: string;
    let resolvedPreviewUrl: string;
    try {
      const r = await fileParaBase64(selectedFile);
      base64 = r.base64;
      mimeType = r.mimeType;
      resolvedPreviewUrl = r.previewUrl;
      if (selectedFile.type === "application/pdf") setPreviewUrl(resolvedPreviewUrl);
    } catch {
      fail("Erro ao converter arquivo. Tente novamente.");
      return;
    }

    // ── Passo 1: OCR ──────────────────────────────────────────────────────
    setActiveStep("ocr");
    const ocrRes = await fetch("/api/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64, mimeType }),
    });
    if (!ocrRes.ok) {
      fail((await ocrRes.json().catch(() => ({}))).error ?? "Erro no OCR. Tente uma foto com mais luz.");
      return;
    }
    const { rawText } = (await ocrRes.json()) as { rawText: string };
    completeStep("ocr");

    // ── Passo 2: IA interpreta ────────────────────────────────────────────
    setActiveStep("analyze");
    const analyzeRes = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText }),
    });
    if (!analyzeRes.ok) {
      fail((await analyzeRes.json().catch(() => ({}))).error ?? "IA não conseguiu interpretar o holerite.");
      return;
    }
    const { analisado } = (await analyzeRes.json()) as { analisado: HoleriteAnalisado };
    const parsedData = analisadoParaParsed(analisado);
    completeStep("analyze");

    // ── Passo 3: Motor CLT ────────────────────────────────────────────────
    setActiveStep("audit");
    const auditRes = await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parsedData }),
    });
    if (!auditRes.ok) {
      fail((await auditRes.json().catch(() => ({}))).error ?? "Erro ao calcular divergências.");
      return;
    }
    const { auditResult } = (await auditRes.json()) as { auditResult: AuditResult };
    completeStep("audit");

    // ── Resultado ─────────────────────────────────────────────────────────
    if (isAnon) {
      // Fluxo anônimo: salva no localStorage e redireciona
      savePendingAudit({ analisado, result: auditResult });
      incrementAuditCount();
      trackAuditCompleted({ hasErrors: auditResult.summary.total_errors > 0, errorCount: auditResult.summary.total_errors, saved: false });
      router.push("/resultado");
    } else {
      // Fluxo autenticado: persiste no banco
      const saveRes = await fetch("/api/auditorias/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analisado, result: auditResult }),
      });
      if (!saveRes.ok) {
        // Salva localmente mesmo assim para não perder o resultado
        savePendingAudit({ analisado, result: auditResult });
        router.push("/resultado");
        return;
      }
      const { id } = (await saveRes.json()) as { id: string };
      trackAuditCompleted({ hasErrors: auditResult.summary.total_errors > 0, errorCount: auditResult.summary.total_errors, saved: true });
      router.push(`/audit/${id}`);
    }
  }

  function completeStep(step: ProcessStep) {
    setCompletedSteps((prev) => [...prev, step]);
    setActiveStep(null);
  }

  function fail(message: string) {
    setErrorMessage(message);
    setUiState("error");
    setActiveStep(null);
  }

  function resetar() {
    setUiState("idle");
    setSelectedFile(null);
    setPreviewUrl(null);
    setCompletedSteps([]);
    setActiveStep(null);
    setErrorMessage("");
  }

  // ── Renderização ────────────────────────────────────────────────────────

  const isProcessing = uiState === "processing";

  return (
    <div className="space-y-4">
      {/* ── Área principal ──────────────────────────────────────────── */}
      {uiState === "idle" && (
        <DropZone
          isDragging={isDragging}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClickUpload={() => inputRef.current?.click()}
          onClickCamera={() => cameraRef.current?.click()}
        />
      )}

      {(uiState === "preview" || uiState === "processing" || uiState === "error") && (
        <div className="bg-white rounded-2xl border overflow-hidden">
          {/* Preview */}
          <div className="p-4 border-b bg-gray-50 flex items-center gap-4">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Preview"
                className="h-20 w-20 object-cover rounded-lg border flex-shrink-0"
              />
            ) : (
              <div className="h-20 w-20 rounded-lg border bg-red-50 flex items-center justify-center flex-shrink-0">
                <span className="text-3xl">📄</span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-800 truncate text-sm">
                {selectedFile?.name}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {selectedFile ? formatBytes(selectedFile.size) : ""}
                {selectedFile?.type === "application/pdf" && " · PDF (página 1)"}
              </p>
              {!isProcessing && (
                <button
                  onClick={resetar}
                  className="text-xs text-green-600 underline mt-1 hover:text-green-700"
                >
                  Trocar arquivo
                </button>
              )}
            </div>
          </div>

          {/* Estado de processamento */}
          {isProcessing && (
            <div className="px-5 py-4 space-y-3">
              {STEPS.map((step) => {
                const done = completedSteps.includes(step);
                const active = activeStep === step;
                return (
                  <div key={step} className="flex items-center gap-3">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold transition-all ${
                        done
                          ? "bg-green-500 text-white"
                          : active
                          ? "border-2 border-green-500 border-t-transparent animate-spin"
                          : "border-2 border-gray-200"
                      }`}
                    >
                      {done ? "✓" : ""}
                    </div>
                    <p
                      className={`text-sm transition-colors ${
                        active
                          ? "font-semibold text-gray-900"
                          : done
                          ? "text-gray-400 line-through"
                          : "text-gray-300"
                      }`}
                    >
                      {STEP_LABEL[step]}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Erro */}
          {uiState === "error" && (
            <div className="px-5 py-4 flex items-start gap-3">
              <span className="text-red-500 text-lg flex-shrink-0 mt-0.5">✕</span>
              <div>
                <p className="font-medium text-red-700 text-sm">Algo deu errado</p>
                <p className="text-sm text-gray-500 mt-0.5">{errorMessage}</p>
                <button
                  onClick={resetar}
                  className="mt-3 text-sm text-green-600 underline hover:text-green-700"
                >
                  Tentar com outro arquivo
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Botão principal ──────────────────────────────────────────── */}
      {uiState === "preview" && (
        <button
          onClick={handleAnalisar}
          className="w-full rounded-xl bg-green-600 py-4 text-base font-semibold text-white hover:bg-green-700 active:bg-green-800 transition-colors shadow-sm"
        >
          Analisar meu holerite
        </button>
      )}

      {/* Inputs escondidos */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={handleInputChange}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────────

interface DropZoneProps {
  isDragging: boolean;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onClickUpload: () => void;
  onClickCamera: () => void;
}

function DropZone({
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onClickUpload,
  onClickCamera,
}: DropZoneProps) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`rounded-2xl border-2 border-dashed transition-colors ${
        isDragging
          ? "border-green-400 bg-green-50"
          : "border-gray-200 bg-white hover:border-green-300 hover:bg-gray-50"
      }`}
    >
      <div className="flex flex-col items-center gap-5 px-8 py-12 text-center">
        <div className="text-5xl select-none">📋</div>

        <div>
          <p className="font-semibold text-gray-800">
            {isDragging ? "Solte o arquivo aqui" : "Arraste o holerite ou selecione"}
          </p>
          <p className="text-sm text-gray-400 mt-1">JPEG · PNG · WebP · PDF</p>
        </div>

        <div className="flex gap-3 flex-wrap justify-center">
          <button
            onClick={onClickUpload}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors shadow-sm"
          >
            <span>📁</span> Selecionar arquivo
          </button>
          <button
            onClick={onClickCamera}
            className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-5 py-2.5 text-sm font-medium text-green-700 hover:bg-green-100 transition-colors shadow-sm"
          >
            <span>📷</span> Tirar foto
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Utils ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
