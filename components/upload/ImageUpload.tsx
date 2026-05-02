"use client";

import { useState, useRef, useCallback, DragEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { analisadoParaParsed } from "@/lib/converters/analyzed-to-parsed";
import { savePendingAudit } from "@/lib/utils/audit-quota";
import { trackAuditCompleted } from "@/lib/analytics";
import { getMissingInfo, detectarTipoHolerite } from "@/lib/clt/engine";
import type { MissingInfoQuestion } from "@/lib/clt/engine";
import type { HoleriteAnalisado, AuditResult, ParsedHolerite, TipoHolerite } from "@/lib/types";
import { cn } from "@/lib/utils";

// ── Tipos ──────────────────────────────────────────────────────────────────────

type UIState = "idle" | "preview" | "processing" | "questions" | "calculating" | "error";
type ProcessStep = "ocr" | "analyze" | "clt" | "questions_check";

const STEP_LABEL: Record<ProcessStep, string> = {
  ocr: "Lendo seu holerite…",
  analyze: "Identificando as verbas…",
  clt: "Conferindo com a CLT…",
  questions_check: "Verificando se precisamos de mais informações…",
};
const STEPS: ProcessStep[] = ["ocr", "analyze", "clt", "questions_check"];

interface IntermediateData {
  analisado: HoleriteAnalisado;
  parsedData: ParsedHolerite;
  preliminaryResult: AuditResult;
  isAnon: boolean;
}

// Respostas às perguntas condicionais: mapa id → valor escolhido (null = pulado)
export type ConditionalAnswers = Partial<Record<MissingInfoQuestion["id"], string | number | null>>;

export function applyConditionalAnswers(
  parsedData: ParsedHolerite,
  questions: MissingInfoQuestion[],
  answers: ConditionalAnswers
): { updated: ParsedHolerite; pulados: string[] } {
  let updated = { ...parsedData };
  const pulados: string[] = [];

  for (const q of questions) {
    const val = answers[q.id];
    const skipped = val === undefined || val === null;

    if (q.id === "dependentes") {
      updated.dependents = skipped ? 0 : (val as number);
      if (skipped) pulados.push(q.noteIfSkipped);
    } else if (q.id === "jornada") {
      updated.horas_mensais_contrato = skipped ? 220 : (val as number);
      if (skipped) pulados.push(q.noteIfSkipped);
    } else if (q.id === "tipo_holerite") {
      updated.tipo_holerite_confirmado = skipped ? null : (val as TipoHolerite);
      if (skipped) pulados.push(q.noteIfSkipped);
    } else if (q.id === "insalubridade_grau") {
      // O motor já lida com grau via cenários condicionais; apenas registra pulo
      if (skipped) pulados.push(q.noteIfSkipped);
    } else if (q.id === "tipo_rescisao") {
      updated.tipo_rescisao = skipped ? null : (val as "sem_justa_causa" | "pedido_demissao" | "acordo_mutuo" | "justa_causa");
      if (skipped) pulados.push(q.noteIfSkipped);
    } else if (q.id === "anos_servico") {
      updated.anos_servico_completos = skipped ? null : (val as number);
      if (skipped) pulados.push(q.noteIfSkipped);
    } else if (q.id === "modalidade_aviso") {
      updated.modalidade_aviso = skipped ? null : (val as "trabalhado" | "indenizado" | "nenhum");
      if (skipped) pulados.push(q.noteIfSkipped);
    } else if (q.id === "ferias_vencidas") {
      updated.ferias_vencidas_periodos = skipped ? null : (val as number);
      if (skipped) pulados.push(q.noteIfSkipped);
    }
  }

  return { updated, pulados };
}

async function fileParaBase64(file: File): Promise<{
  base64: string;
  mimeType: string;
  previewUrl: string | null;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve({
        base64: dataUrl.split(",")[1],
        mimeType: file.type || "image/jpeg",
        previewUrl: file.type === "application/pdf" ? null : dataUrl,
      });
    };
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
  });
}

// ── Componente principal ───────────────────────────────────────────────────────

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
  const [intermediateData, setIntermediateData] = useState<IntermediateData | null>(null);
  const [questions, setQuestions] = useState<MissingInfoQuestion[]>([]);
  const [answers, setAnswers] = useState<ConditionalAnswers>({});

  // ── Arquivo ────────────────────────────────────────────────────────────────

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
    if (file.type === "application/pdf") {
      setPreviewUrl(null);
    } else {
      setPreviewUrl(URL.createObjectURL(file));
    }
    setUiState("preview");
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
    e.target.value = "";
  }

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

  // ── Pipeline fase 1: OCR + Analyze + CLT + check ──────────────────────────

  async function handleAnalisar() {
    if (!selectedFile) return;

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const isAnon = !session;

    setUiState("processing");
    setCompletedSteps([]);
    setErrorMessage("");

    let base64: string;
    let mimeType: string;
    try {
      const r = await fileParaBase64(selectedFile);
      base64 = r.base64;
      mimeType = r.mimeType;
    } catch {
      fail("Erro ao converter arquivo. Tente novamente.");
      return;
    }

    // Passo 1: OCR
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

    // Passo 2: IA interpreta
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

    // Passo 3: Motor CLT (auditoria preliminar com os dados extraídos)
    setActiveStep("clt");
    const auditRes = await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parsedData }),
    });
    if (!auditRes.ok) {
      fail((await auditRes.json().catch(() => ({}))).error ?? "Erro ao calcular divergências.");
      return;
    }
    const { auditResult: preliminaryResult } = (await auditRes.json()) as { auditResult: AuditResult };
    completeStep("clt");

    // Passo 4: Verifica quais informações faltam (usa o resultado preliminar para evitar perguntas desnecessárias)
    setActiveStep("questions_check");
    const missing = getMissingInfo(parsedData, preliminaryResult);
    completeStep("questions_check");

    setIntermediateData({ analisado, parsedData, preliminaryResult, isAnon });

    if (missing.length === 0) {
      // Nenhuma pergunta necessária → resultado direto
      await finalizarAuditoria(analisado, parsedData, preliminaryResult, [], isAnon);
    } else {
      setQuestions(missing);
      setAnswers({});
      setUiState("questions");
    }
  }

  // ── Pipeline fase 2: Recalcula com respostas e finaliza ───────────────────

  async function handleContinueFromQuestions(skippedAll = false) {
    if (!intermediateData) return;
    const { analisado, parsedData, isAnon } = intermediateData;

    const effectiveAnswers = skippedAll ? {} : answers;
    const { updated, pulados } = applyConditionalAnswers(parsedData, questions, effectiveAnswers);

    setUiState("calculating");

    // Re-roda o motor com as respostas (ou com defaults se pular tudo)
    const auditRes = await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parsedData: updated }),
    });
    if (!auditRes.ok) {
      fail((await auditRes.json().catch(() => ({}))).error ?? "Erro ao calcular divergências.");
      return;
    }
    const { auditResult } = (await auditRes.json()) as { auditResult: AuditResult };

    await finalizarAuditoria(analisado, updated, auditResult, pulados, isAnon);
  }

  async function finalizarAuditoria(
    analisado: HoleriteAnalisado,
    parsedData: ParsedHolerite,
    auditResult: AuditResult,
    pulados: string[],
    isAnon: boolean
  ) {
    if (pulados.length > 0) {
      auditResult.campos_pulados = pulados;
    }

    if (isAnon) {
      savePendingAudit({ analisado, result: auditResult });
      trackAuditCompleted({
        hasErrors: auditResult.summary.total_errors > 0,
        errorCount: auditResult.summary.total_errors,
        saved: false,
      });
      router.push("/resultado");
    } else {
      const saveRes = await fetch("/api/auditorias/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analisado, result: auditResult }),
      });
      if (!saveRes.ok) {
        savePendingAudit({ analisado, result: auditResult });
        router.push("/resultado");
        return;
      }
      const { id } = (await saveRes.json()) as { id: string };
      trackAuditCompleted({
        hasErrors: auditResult.summary.total_errors > 0,
        errorCount: auditResult.summary.total_errors,
        saved: true,
      });
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
    setIntermediateData(null);
    setQuestions([]);
    setAnswers({});
  }

  const progressPct = uiState === "processing"
    ? completedSteps.length === 0 && activeStep === "ocr" ? 15
    : completedSteps.length === 1 && activeStep === "analyze" ? 35
    : completedSteps.length === 2 && activeStep === "clt" ? 65
    : completedSteps.length === 3 && activeStep === "questions_check" ? 88
    : completedSteps.length === 4 ? 100
    : 5
    : 0;

  // ── States ─────────────────────────────────────────────────────────────────

  if (uiState === "questions" && intermediateData) {
    return (
      <ConditionalQuestions
        questions={questions}
        answers={answers}
        onChange={setAnswers}
        onContinue={() => handleContinueFromQuestions(false)}
        onSkipAll={() => handleContinueFromQuestions(true)}
      />
    );
  }

  if (uiState === "calculating") {
    return (
      <div className="py-20 flex flex-col items-center gap-4 text-center">
        <div className="w-10 h-10 rounded-full border-[3px] border-tc-green border-t-transparent animate-spin" />
        <p className="text-sm font-medium text-[var(--tc-ink-soft)]">Preparando seu resultado…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── IDLE: dropzone ─────────────────────────────────────────────────── */}
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

      {/* ── PREVIEW / PROCESSING / ERROR: file strip ───────────────────────── */}
      {(uiState === "preview" || uiState === "processing" || uiState === "error") && (
        <div className="space-y-4">

          {/* File card */}
          <div className="flex items-center gap-4 p-4 bg-tc-paper border border-tc-line rounded-2xl">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Preview" className="h-20 w-20 object-cover rounded-xl border border-tc-line flex-shrink-0" />
            ) : (
              <div className="h-20 w-20 rounded-xl border border-tc-line bg-tc-bg flex items-center justify-center flex-shrink-0 text-3xl">
                📄
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium text-tc-ink truncate text-sm">{selectedFile?.name}</p>
              <p className="text-xs text-tc-muted mt-0.5">
                {selectedFile ? formatBytes(selectedFile.size) : ""}
                {selectedFile?.type === "application/pdf" && " · PDF"}
              </p>
              {uiState !== "processing" && (
                <button onClick={resetar} className="mt-1.5 text-xs text-tc-accent font-semibold hover:underline">
                  Trocar arquivo
                </button>
              )}
            </div>
          </div>

          {/* Processing steps */}
          {uiState === "processing" && (
            <div className="space-y-4 bg-tc-paper border border-tc-line rounded-2xl p-6">
              <div className="h-1.5 bg-tc-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-tc-green rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="space-y-3">
                {STEPS.map((step) => {
                  const done = completedSteps.includes(step);
                  const active = activeStep === step;
                  return (
                    <div key={step} className="flex items-center gap-3">
                      <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold transition-all",
                        done ? "bg-tc-green text-tc-paper"
                          : active ? "border-2 border-tc-green border-t-transparent animate-spin"
                          : "border-2 border-tc-line"
                      )}>
                        {done ? "✓" : ""}
                      </div>
                      <p className={cn(
                        "text-sm transition-colors",
                        active ? "font-semibold text-tc-ink"
                          : done ? "text-tc-muted line-through"
                          : "text-tc-muted opacity-40"
                      )}>
                        {STEP_LABEL[step]}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Error */}
          {uiState === "error" && (
            <div className="bg-tc-coral/8 border border-tc-coral/30 rounded-2xl p-5">
              <p className="font-semibold text-tc-coral text-sm">Algo deu errado</p>
              <p className="text-sm text-[var(--tc-ink-soft)] mt-1">{errorMessage}</p>
              <button onClick={resetar} className="mt-3 text-sm text-tc-accent font-semibold hover:underline">
                Tentar com outro arquivo
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── PREVIEW: CTA ───────────────────────────────────────────────────── */}
      {uiState === "preview" && (
        <button
          onClick={handleAnalisar}
          className="w-full bg-tc-green text-tc-paper rounded-full py-4 text-sm font-semibold hover:bg-[#245038] transition-colors"
        >
          Auditar meu holerite →
        </button>
      )}

      {/* ── Security badges (idle only) ────────────────────────────────────── */}
      {uiState === "idle" && (
        <div className="grid grid-cols-3 gap-3 mt-2">
          {[
            { t: "Criptografado", d: "TLS 1.3 + AES-256 ponta a ponta." },
            { t: "Apagado em 24h", d: "Seu holerite sai dos nossos servidores." },
            { t: "Anônimo", d: "Sem cadastro nesta primeira auditoria." },
          ].map((c) => (
            <div key={c.t} className="flex gap-3 p-4 bg-tc-paper border border-tc-line rounded-xl">
              <div>
                <div className="font-semibold text-xs text-tc-ink">{c.t}</div>
                <div className="text-[11px] text-tc-muted mt-0.5 leading-snug">{c.d}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tip (idle only) ────────────────────────────────────────────────── */}
      {uiState === "idle" && (
        <div className="bg-tc-paper border border-tc-line rounded-2xl px-5 py-4 flex gap-4 items-start">
          <div className="w-8 h-8 rounded-lg bg-tc-green text-tc-paper grid place-items-center flex-shrink-0 text-base">
            ✦
          </div>
          <div>
            <div className="font-semibold text-sm mb-1">Dica pra uma foto perfeita</div>
            <div className="text-xs text-[var(--tc-ink-soft)] leading-relaxed">
              Superfície plana, boa iluminação, folha inteira enquadrada. Se tiver o PDF original, melhor ainda — o reconhecimento fica mais preciso.
            </div>
          </div>
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={handleInputChange} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleInputChange} />
    </div>
  );
}

// ── DropZone ───────────────────────────────────────────────────────────────────

interface DropZoneProps {
  isDragging: boolean;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onClickUpload: () => void;
  onClickCamera: () => void;
}

function DropZone({ isDragging, onDragOver, onDragLeave, onDrop, onClickUpload, onClickCamera }: DropZoneProps) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClickUpload}
      className={cn(
        "bg-tc-paper border-2 border-dashed rounded-3xl py-16 px-8 text-center cursor-pointer transition-all duration-200",
        isDragging
          ? "border-tc-accent -translate-y-0.5 shadow-xl"
          : "border-tc-line hover:border-tc-accent hover:shadow-lg"
      )}
    >
      <div className="w-22 h-22 bg-tc-green text-tc-paper rounded-[22px] grid place-items-center mx-auto mb-6"
        style={{ width: 88, height: 88, borderRadius: 22 }}>
        <svg width="38" height="38" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 12l-4-4m0 0l-4 4m4-4v12" />
        </svg>
      </div>

      <p className="font-display text-3xl font-medium tracking-tight mb-2">
        {isDragging ? "Solte aqui" : "Arraste o arquivo aqui"}
      </p>
      <p className="text-sm text-tc-muted mb-7">ou clique para escolher · JPG, PNG, PDF até 15MB</p>

      <div className="flex gap-3 justify-center flex-wrap" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClickUpload}
          className="bg-tc-green text-tc-paper rounded-full px-5 py-2.5 text-sm font-semibold hover:bg-[#245038] transition-colors inline-flex items-center gap-2"
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Escolher arquivo
        </button>
        <button
          type="button"
          onClick={onClickCamera}
          className="border-[1.5px] border-tc-line text-tc-ink rounded-full px-5 py-2.5 text-sm font-semibold hover:border-tc-green transition-colors inline-flex items-center gap-2 bg-transparent"
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Tirar foto
        </button>
      </div>
    </div>
  );
}

// ── ConditionalQuestions ───────────────────────────────────────────────────────

function ConditionalQuestions({
  questions,
  answers,
  onChange,
  onContinue,
  onSkipAll,
}: {
  questions: MissingInfoQuestion[];
  answers: ConditionalAnswers;
  onChange: (a: ConditionalAnswers) => void;
  onContinue: () => void;
  onSkipAll: () => void;
}) {
  function setAnswer(id: MissingInfoQuestion["id"], value: string | number | null) {
    onChange({ ...answers, [id]: value });
  }

  const answeredCount = questions.filter((q) => answers[q.id] !== undefined && answers[q.id] !== null).length;
  const totalCount = questions.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-tc-paper border border-tc-line rounded-2xl px-5 py-5">
        <p className="font-semibold text-tc-ink text-sm mb-1">
          Quase lá! Precisamos confirmar {totalCount === 1 ? "1 informação" : `${totalCount} informações`} para uma análise mais precisa.
        </p>
        <p className="text-xs text-tc-muted">Todas as perguntas são opcionais — use &quot;Não sei&quot; se não souber.</p>
        <button
          onClick={onSkipAll}
          className="mt-3 text-xs text-tc-accent font-semibold hover:underline"
        >
          Pular tudo → ver resultado agora
        </button>
      </div>

      {/* Question cards */}
      {questions.map((q) => (
        <div key={q.id} className="bg-tc-paper border border-tc-line rounded-2xl px-5 py-5">
          <p className="font-semibold text-tc-ink text-sm mb-4">{q.question}</p>
          <div className="flex flex-wrap gap-2">
            {q.options.map((opt) => {
              const active = answers[q.id] === opt.value || (opt.value === null && answers[q.id] === null && q.id in answers);
              const isSkip = opt.value === null;
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() => setAnswer(q.id, opt.value)}
                  className={cn(
                    "px-4 py-2.5 rounded-xl text-sm font-medium border transition-all",
                    active && !isSkip
                      ? "bg-tc-green text-tc-paper border-tc-green"
                      : active && isSkip
                      ? "border-tc-line text-tc-muted bg-tc-bg-alt"
                      : isSkip
                      ? "border-dashed border-tc-line text-tc-muted hover:border-tc-muted"
                      : "bg-tc-bg text-tc-ink border-tc-line hover:border-tc-green/50 hover:bg-tc-green/5"
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {answers[q.id] === null && (
            <p className="text-[11px] text-tc-muted mt-3">
              Padrão: {q.noteIfSkipped}
            </p>
          )}
        </div>
      ))}

      {/* CTA */}
      <div className="pt-1">
        <button
          onClick={onContinue}
          className="w-full bg-tc-green text-tc-paper rounded-full py-4 text-sm font-semibold hover:bg-[#245038] transition-colors"
        >
          {answeredCount === totalCount
            ? "Ver resultado →"
            : answeredCount > 0
            ? `Ver resultado (${totalCount - answeredCount} com padrão CLT) →`
            : "Ver resultado com padrões CLT →"}
        </button>
      </div>
    </div>
  );
}

// ── Utils ──────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
