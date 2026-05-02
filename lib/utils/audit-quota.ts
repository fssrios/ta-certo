/**
 * Quota e estado temporário de auditoria — armazenados no localStorage.
 * Só funciona no browser (client components).
 */

import type { HoleriteAnalisado, AuditResult } from "@/lib/types";

const PENDING_KEY = "tacerto_pending_audit";

// ── Auditoria pendente (salvar após login) ────────────────────────────────────

export interface PendingAudit {
  analisado: HoleriteAnalisado;
  result: AuditResult;
  savedAt: string;
}

export function savePendingAudit(data: Omit<PendingAudit, "savedAt">): void {
  const payload: PendingAudit = { ...data, savedAt: new Date().toISOString() };
  localStorage.setItem(PENDING_KEY, JSON.stringify(payload));
}

export function getPendingAudit(): PendingAudit | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingAudit;
  } catch {
    return null;
  }
}

export function clearPendingAudit(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PENDING_KEY);
}
