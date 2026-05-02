"use client";

import { AuditResult } from "@/components/audit/AuditResult";
import { analisadoParaParsed } from "@/lib/converters/analyzed-to-parsed";
import type { Auditoria } from "@/lib/types";

export function AuditDetailClient({ auditoria }: { auditoria: Auditoria }) {
  const parsedData = auditoria.dados_extraidos
    ? analisadoParaParsed(auditoria.dados_extraidos)
    : undefined;

  return (
    <AuditResult
      result={auditoria.dados_calculados!}
      createdAt={auditoria.created_at}
      parsedData={parsedData}
    />
  );
}
