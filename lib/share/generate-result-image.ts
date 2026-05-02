/**
 * Gera uma imagem PNG 1080×1080 com o resultado da auditoria.
 * Roda apenas no browser (usa HTMLCanvasElement).
 */

export interface ShareImageData {
  hasErrors: boolean;
  errorCount: number;
  /** net_expected - net_declared  (positivo = trabalhador recebeu menos) */
  deficit: number;
  inss: { declared: number; expected: number };
  irrf: { declared: number; expected: number };
  net: { declared: number; expected: number };
  appUrl?: string;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── main ─────────────────────────────────────────────────────────────────────

export async function generateResultImage(data: ShareImageData): Promise<Blob> {
  const W = 1080;
  const H = 1080;
  const CX = W / 2;
  const FONT = "'Helvetica Neue', Arial, sans-serif";
  const appUrl = data.appUrl ?? "tacerto.com.br";

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // ── background
  ctx.fillStyle = data.hasErrors ? "#DC2626" : "#16A34A";
  ctx.fillRect(0, 0, W, H);

  // ── decorative circles
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(W + 60, -60, 300, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-60, H + 40, 220, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // ── logo
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 48px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fillText("Tá Certo?", CX, 82);

  // ── separator under logo
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(80, 110);
  ctx.lineTo(W - 80, 110);
  ctx.stroke();

  // ── main content ────────────────────────────────────────────────────────────

  if (data.hasErrors) {
    // error badge
    const badge =
      data.errorCount === 1 ? "1 erro encontrado" : `${data.errorCount} erros encontrados`;
    ctx.font = `600 30px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.textAlign = "center";
    ctx.fillText(`⚠ ${badge}`, CX, 182);

    if (data.deficit > 0.05) {
      ctx.font = `400 38px ${FONT}`;
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.fillText("Você deveria receber", CX, 272);

      // scale amount to fit width
      const amountText = brl(data.deficit);
      let fs = 100;
      ctx.font = `800 ${fs}px ${FONT}`;
      while (ctx.measureText(amountText).width > W - 100 && fs > 56) {
        fs -= 4;
        ctx.font = `800 ${fs}px ${FONT}`;
      }
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(amountText, CX, 390);

      ctx.font = `400 38px ${FONT}`;
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.fillText("a mais este mês", CX, 460);
    } else {
      ctx.font = `400 36px ${FONT}`;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText("Divergências encontradas", CX, 330);
      ctx.fillText("no seu holerite.", CX, 382);
    }

    // ── summary card
    const CL = 80, CY = 518, CW = W - 160, CH = 338;
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    roundRect(ctx, CL, CY, CW, CH, 28);
    ctx.fill();

    // column x positions
    const xLabel  = CL + 44;
    const xDeclR  = CL + CW / 2 - 20;
    const xArrow  = CL + CW / 2 + 22;
    const xExpR   = CL + CW - 44;

    // column header
    ctx.font = `500 21px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.textAlign = "center";
    ctx.fillText("DECLARADO  →  CORRETO", CX, CY + 42);

    const rows = [
      { label: "INSS",           decl: data.inss.declared, exp: data.inss.expected },
      { label: "IRRF",           decl: data.irrf.declared, exp: data.irrf.expected },
      { label: "Salário Líquido", decl: data.net.declared,  exp: data.net.expected  },
    ];

    rows.forEach((row, i) => {
      const ry = CY + 118 + i * 84;
      const ok = Math.abs(row.decl - row.exp) < 0.05;
      const isNet = i === 2;

      if (i > 0) {
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(CL + 24, ry - 26);
        ctx.lineTo(CL + CW - 24, ry - 26);
        ctx.stroke();
      }

      ctx.textAlign = "left";
      ctx.font = isNet ? `700 28px ${FONT}` : `400 28px ${FONT}`;
      ctx.fillStyle = "rgba(255,255,255,0.90)";
      ctx.fillText(row.label, xLabel, ry);

      ctx.textAlign = "right";
      ctx.font = `400 26px ${FONT}`;
      ctx.fillStyle = "rgba(255,255,255,0.52)";
      ctx.fillText(brl(row.decl), xDeclR, ry);

      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillText("→", xArrow, ry);

      ctx.textAlign = "right";
      ctx.font = isNet ? `700 28px ${FONT}` : `400 26px ${FONT}`;
      ctx.fillStyle = ok ? "rgba(255,255,255,0.90)" : isNet ? "#FFFFFF" : "#F28B8B";
      ctx.fillText(brl(row.exp), xExpR, ry);
    });

  } else {
    // ── OK state
    ctx.font = `120px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("✅", CX, 390);

    ctx.font = `700 62px ${FONT}`;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText("Tudo certo!", CX, 490);

    ctx.font = `400 36px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText("Seu holerite está correto.", CX, 558);
    ctx.fillText("Cálculos verificados · CLT 2026", CX, 612);

    // net salary box
    const BY = 678, BH = 164;
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    roundRect(ctx, 80, BY, W - 160, BH, 24);
    ctx.fill();

    ctx.font = `400 28px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.70)";
    ctx.fillText("Salário líquido", CX, BY + 52);
    ctx.font = `700 46px ${FONT}`;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(brl(data.net.declared), CX, BY + 120);
  }

  // ── footer separator
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(80, H - 146);
  ctx.lineTo(W - 80, H - 146);
  ctx.stroke();

  // ── footer text
  ctx.textAlign = "center";
  ctx.font = `400 26px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.58)";
  ctx.fillText("Audite seu holerite gratuitamente em", CX, H - 96);

  ctx.font = `700 42px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fillText(appUrl, CX, H - 42);

  // ── export to Blob
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("canvas.toBlob falhou"));
      },
      "image/png"
    );
  });
}
