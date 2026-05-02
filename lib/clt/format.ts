import type { TipoRescisao } from "@/lib/types";

export function formatarTipoRescisao(t: TipoRescisao | null): string {
  if (!t) return "Não identificado";
  const map: Record<TipoRescisao, string> = {
    sem_justa_causa: "Demissão sem justa causa",
    pedido_demissao: "Pedido de demissão",
    acordo_mutuo:    "Acordo mútuo (CLT 484-A)",
    justa_causa:     "Justa causa",
  };
  return map[t];
}

export function formatarAnosServico(anos: number | null): string {
  if (anos === null) return "Não identificado";
  if (anos === 0) return "Menos de 1 ano";
  if (anos === 1) return "1 ano";
  return `${anos} anos`;
}

export function formatarModalidadeAviso(m: string | null): string {
  if (!m) return "—";
  const map: Record<string, string> = {
    trabalhado: "Trabalhado (você foi até a data final)",
    indenizado: "Indenizado (você não trabalhou o aviso)",
    nenhum:     "Não houve aviso prévio",
  };
  return map[m] ?? m;
}

export function formatarFeriasVencidas(p: number): string {
  if (p === 0) return "Nenhuma";
  if (p === 1) return "1 período";
  return `${p} períodos`;
}

/** Gera a frase de exemplo dinâmica baseada na premissa de maior impacto. */
export function gerarExemploDinamico(
  tipoRescisao: TipoRescisao | null,
  anosServico: number | null
): string {
  if (anosServico !== null && anosServico < 5) {
    const diasAtual = 30 + anosServico * 3;
    return `Por exemplo, se você trabalhou 5 anos, o aviso prévio sobe de ${diasAtual} para 45 dias — e todos os cálculos que dependem do aviso mudam junto.`;
  }
  if (tipoRescisao === "sem_justa_causa") {
    return "Por exemplo, se foi pedido de demissão, você não teria direito à multa de 40% do FGTS — o que muda bastante o valor total.";
  }
  if (tipoRescisao === "pedido_demissao") {
    return "Por exemplo, se foi demissão sem justa causa, você teria direito à multa de 40% do FGTS — o que aumenta o valor total.";
  }
  return "Responda as perguntas para que os cálculos reflitam exatamente a sua situação.";
}
