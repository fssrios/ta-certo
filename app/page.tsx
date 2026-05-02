import Link from "next/link";
import { CtaLink } from "@/components/landing/CtaLink";
import { LandingCounter } from "@/components/landing/LandingCounter";

const TESTIMONIALS = [
  {
    texto: "Meu INSS estava sendo descontado errado faz 3 meses. Consegui pedir o ressarcimento no RH com o relatório do Tá Certo.",
    nome: "Maria S.",
    cargo: "Analista de TI",
    cidade: "São Paulo",
  },
  {
    texto: "Em menos de um minuto eu já sabia quanto estavam me devendo — e com qual artigo da lei cobrar.",
    nome: "Rosângela O.",
    cargo: "Técnica de enfermagem",
    cidade: "Duque de Caxias",
  },
  {
    texto: "Simples demais. Tirei foto com o celular, em 40 segundos apareceu tudo. Tinha R$ 87 de diferença no IRRF.",
    nome: "Carlos M.",
    cargo: "Motorista CLT",
    cidade: "Belo Horizonte",
  },
];

const CLT_ITEMS = [
  { t: "Adicional noturno", a: "CLT Art. 73" },
  { t: "Horas extras 50% e 100%", a: "CLT Art. 59" },
  { t: "Insalubridade", a: "CLT Art. 192" },
  { t: "Periculosidade", a: "CLT Art. 193" },
  { t: "INSS progressivo 2026", a: "Lei 8.212/91" },
  { t: "IRRF com dependentes", a: "Lei 7.713/88" },
  { t: "FGTS 8%", a: "Lei 8.036/90" },
  { t: "DSR sobre variáveis", a: "Lei 605/49" },
];

const SECURITY_ITEMS = [
  { t: "Criptografia TLS 1.3 + AES-256", d: "Transmissão segura e armazenamento cifrado." },
  { t: "Anônimo por padrão", d: "Primeira auditoria sem cadastro ou e-mail." },
  { t: "Auditável e aberto", d: "Motor CLT publicado com licença MIT no GitHub." },
  { t: "LGPD-first", d: "Você exclui tudo, a qualquer momento, num clique." },
];

const HERO_COLOR_BLOCK = true; // ← mude para false para reverter

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-tc-bg text-tc-ink font-body">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 sm:px-14 py-5 bg-tc-bg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-tc-green text-tc-paper rounded-xl grid place-items-center font-display font-semibold text-lg">
            tc
          </div>
          <span className="font-display text-xl font-medium tracking-tight">Tá Certo.</span>
        </div>
        <nav className="hidden md:flex gap-8 text-sm text-[var(--tc-ink-soft)]">
          <a className="hover:text-tc-ink transition-colors cursor-pointer">Como funciona</a>
          <a className="hover:text-tc-ink transition-colors cursor-pointer">Direitos</a>
          <a className="hover:text-tc-ink transition-colors cursor-pointer">Ajuda</a>
        </nav>
        <div className="flex gap-3 items-center">
          <Link href="/login" className="hidden sm:block font-semibold text-sm text-tc-ink hover:text-tc-green transition-colors">
            Entrar
          </Link>
          <CtaLink href="/audit/new" location="header" className="bg-tc-green text-tc-paper rounded-full px-5 py-2.5 text-sm font-semibold hover:bg-[#245038] transition-colors">
            Conferir grátis
          </CtaLink>
        </div>
      </header>

      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-5 sm:px-14 pt-12 pb-20 max-w-[1440px] mx-auto">
        {HERO_COLOR_BLOCK && (
          <div className="absolute inset-y-0 right-0 w-1/2 bg-[#1B4332] rounded-bl-[80px] hidden md:block" style={{ zIndex: 0 }} />
        )}
        <div className="relative grid md:grid-cols-2 gap-16 items-center" style={{ zIndex: 1 }}>

          {/* Left */}
          <div>
            <div className="inline-flex items-center gap-2 bg-tc-paper border border-tc-line rounded-full px-4 py-1.5 text-xs font-semibold text-[var(--tc-ink-soft)] mb-7">
              <span className="w-1.5 h-1.5 rounded-full bg-tc-accent" />
              CLT 2026 · Gratuito · Sem cadastro
            </div>

            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-normal leading-[0.97] tracking-tight text-balance">
              Cada centavo<br />do seu trabalho,<br />
              <em className="text-tc-accent">no lugar certo.</em>
            </h1>

            <p className="mt-6 text-lg text-[var(--tc-ink-soft)] leading-relaxed max-w-md">
              Conferimos cada linha do seu holerite contra a legislação trabalhista brasileira — e explicamos em português claro. Sem susto. Sem jargão.
            </p>

            <div className="flex items-center gap-4 mt-8">
              <CtaLink href="/audit/new" location="hero" className="bg-tc-green text-tc-paper rounded-full px-7 py-4 text-sm font-semibold hover:bg-[#245038] transition-colors inline-flex items-center gap-2">
                Conferir meu holerite →
              </CtaLink>
              <span className="text-sm text-tc-muted">Leva 30s · Anônimo</span>
            </div>

            {/* Stats */}
            <div className="mt-14 grid grid-cols-3 gap-12 pt-7 border-t border-tc-line w-full">
              <div className="text-left">
                <div className="font-display text-4xl font-medium tracking-tight">28k+</div>
                <div className="text-xs text-tc-muted mt-1">holerites auditados</div>
              </div>
              <div className="text-left">
                <LandingCounter />
                <div className="text-xs text-tc-muted mt-1">já devolvidos a trabalhadores</div>
              </div>
              <div className="text-left">
                <div className="font-display text-4xl font-medium tracking-tight">43%</div>
                <div className="text-xs text-tc-muted mt-1">tinham ao menos 1 erro</div>
              </div>
            </div>
          </div>

          {/* Right — holerite illustration */}
          <div className="hidden md:flex items-center justify-center">
            <svg
              viewBox="0 0 600 500"
              xmlns="http://www.w3.org/2000/svg"
              className="w-full max-w-[600px]"
              aria-hidden="true"
            >
              <defs>
                <filter id="tcDocShadow" x="-15%" y="-15%" width="130%" height="130%">
                  <feDropShadow dx="0" dy="5" stdDeviation="10" floodColor="rgba(0,0,0,0.14)" />
                </filter>
                <filter id="tcBadgeShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="rgba(0,0,0,0.12)" />
                </filter>
                <filter id="tcScanBlur" x="0%" y="-80%" width="100%" height="260%">
                  <feGaussianBlur stdDeviation="0 5" />
                </filter>
                <linearGradient id="tcScanGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%"   stopColor="rgba(230,140,60,0)"  />
                  <stop offset="20%"  stopColor="rgba(230,140,60,0.55)" />
                  <stop offset="50%"  stopColor="rgba(240,160,80,0.82)" />
                  <stop offset="80%"  stopColor="rgba(230,140,60,0.55)" />
                  <stop offset="100%" stopColor="rgba(230,140,60,0)"  />
                </linearGradient>
              </defs>

              {/* ── Document + scan (same rotated group) ───────────────────── */}
              <g transform="rotate(-5, 300, 252)">
                {/* Paper */}
                <rect x="68" y="60" width="468" height="370" rx="3" fill="white" filter="url(#tcDocShadow)" />

                {/* Header */}
                <text x="86" y="83"  fontFamily="monospace" fontSize="9"    fill="#aaa">RECIBO DE PAGAMENTO — CLT</text>
                <text x="86" y="98"  fontFamily="monospace" fontSize="11"   fontWeight="700" fill="#111">CONSTRUTORA SANTOS &amp; LIMA LTDA</text>
                <text x="86" y="111" fontFamily="monospace" fontSize="8.5"  fill="#aaa">CNPJ 12.345.678/0001-90</text>

                {/* Competência — top right */}
                <text x="502" y="83"  fontFamily="monospace" fontSize="8"    fill="#aaa"  textAnchor="end">COMPETÊNCIA</text>
                <text x="502" y="98"  fontFamily="monospace" fontSize="11"   fontWeight="700" fill="#111" textAnchor="end">03/2026</text>

                {/* Employee */}
                <text x="86" y="127" fontFamily="monospace" fontSize="8.5" fill="#555">
                  {`Funcionário: `}<tspan fontWeight="700" fill="#111">MARIA APARECIDA DOS SANTOS</tspan>
                </text>
                <text x="86" y="140" fontFamily="monospace" fontSize="8" fill="#888">Matr. 00487   Cargo: Auxiliar de Limpeza   Adm. 14/08/2021</text>

                {/* Dotted divider */}
                <line x1="86" y1="149" x2="514" y2="149" stroke="#ccc" strokeWidth="0.8" strokeDasharray="3,4" />

                {/* Table header */}
                <text x="86"  y="162" fontFamily="monospace" fontSize="7.5" fill="#bbb" fontWeight="600">COD</text>
                <text x="118" y="162" fontFamily="monospace" fontSize="7.5" fill="#bbb" fontWeight="600">DESCRIÇÃO</text>
                <text x="308" y="162" fontFamily="monospace" fontSize="7.5" fill="#bbb" fontWeight="600">REF.</text>
                <text x="386" y="162" fontFamily="monospace" fontSize="7.5" fill="#bbb" fontWeight="600">PROVENTOS</text>
                <text x="470" y="162" fontFamily="monospace" fontSize="7.5" fill="#bbb" fontWeight="600">DESCONTOS</text>

                {/* Row 1 — ok */}
                <line x1="86" y1="168" x2="514" y2="168" stroke="#f0f0f0" strokeWidth="0.6" />
                <text x="86"  y="180" fontFamily="monospace" fontSize="8.5" fill="#111">001</text>
                <text x="118" y="180" fontFamily="monospace" fontSize="8.5" fill="#111">SALÁRIO BASE</text>
                <text x="308" y="180" fontFamily="monospace" fontSize="8.5" fill="#111">30 dias</text>
                <text x="386" y="180" fontFamily="monospace" fontSize="8.5" fill="#111">R$ 1.850,00</text>

                {/* Row 2 — ok */}
                <line x1="86" y1="186" x2="514" y2="186" stroke="#f0f0f0" strokeWidth="0.6" />
                <text x="86"  y="198" fontFamily="monospace" fontSize="8.5" fill="#111">104</text>
                <text x="118" y="198" fontFamily="monospace" fontSize="8.5" fill="#111">HORAS EXTRAS 50%</text>
                <text x="308" y="198" fontFamily="monospace" fontSize="8.5" fill="#111">12h</text>
                <text x="386" y="198" fontFamily="monospace" fontSize="8.5" fill="#111">R$ 126,50</text>

                {/* Row 3 — error */}
                <line x1="86" y1="204" x2="514" y2="204" stroke="#f0f0f0" strokeWidth="0.6" />
                <text x="86"  y="216" fontFamily="monospace" fontSize="8.5" fill="#8B1A1A">120</text>
                <text x="118" y="216" fontFamily="monospace" fontSize="8.5" fill="#8B1A1A">ADICIONAL NOTURNO 20%</text>
                <text x="308" y="216" fontFamily="monospace" fontSize="8.5" fill="#8B1A1A">22h</text>
                <text x="386" y="216" fontFamily="monospace" fontSize="8.5" fill="#8B1A1A">R$ 38,15</text>
                <circle cx="511" cy="212" r="4" fill="#8B1A1A" />

                {/* Row 4 — error */}
                <line x1="86" y1="222" x2="514" y2="222" stroke="#f0f0f0" strokeWidth="0.6" />
                <text x="86"  y="234" fontFamily="monospace" fontSize="8.5" fill="#8B1A1A">150</text>
                <text x="118" y="234" fontFamily="monospace" fontSize="8.5" fill="#8B1A1A">DSR S/ VARIÁVEIS</text>
                <text x="308" y="234" fontFamily="monospace" fontSize="8.5" fill="#8B1A1A">4 domingos</text>
                <text x="386" y="234" fontFamily="monospace" fontSize="8.5" fill="#8B1A1A">R$ 0,00</text>
                <circle cx="511" cy="230" r="4" fill="#8B1A1A" />

                {/* Row 5 — error */}
                <line x1="86" y1="240" x2="514" y2="240" stroke="#f0f0f0" strokeWidth="0.6" />
                <text x="86"  y="252" fontFamily="monospace" fontSize="8.5" fill="#8B1A1A">901</text>
                <text x="118" y="252" fontFamily="monospace" fontSize="8.5" fill="#8B1A1A">INSS</text>
                <text x="308" y="252" fontFamily="monospace" fontSize="8.5" fill="#8B1A1A">9,00%</text>
                <text x="470" y="252" fontFamily="monospace" fontSize="8.5" fill="#8B1A1A">R$ 176,40</text>
                <circle cx="511" cy="248" r="4" fill="#8B1A1A" />

                {/* Row 6 — ok */}
                <line x1="86" y1="258" x2="514" y2="258" stroke="#f0f0f0" strokeWidth="0.6" />
                <text x="86"  y="270" fontFamily="monospace" fontSize="8.5" fill="#111">910</text>
                <text x="118" y="270" fontFamily="monospace" fontSize="8.5" fill="#111">IRRF</text>
                <text x="308" y="270" fontFamily="monospace" fontSize="8.5" fill="#111">—</text>
                <text x="470" y="270" fontFamily="monospace" fontSize="8.5" fill="#111">R$ 0,00</text>

                {/* Row 7 — ok */}
                <line x1="86" y1="276" x2="514" y2="276" stroke="#f0f0f0" strokeWidth="0.6" />
                <text x="86"  y="288" fontFamily="monospace" fontSize="8.5" fill="#111">920</text>
                <text x="118" y="288" fontFamily="monospace" fontSize="8.5" fill="#111">VALE TRANSPORTE</text>
                <text x="308" y="288" fontFamily="monospace" fontSize="8.5" fill="#111">6,00%</text>
                <text x="470" y="288" fontFamily="monospace" fontSize="8.5" fill="#111">R$ 111,00</text>

                {/* Thick divider */}
                <line x1="86" y1="298" x2="514" y2="298" stroke="#222" strokeWidth="1.5" />

                {/* Footer */}
                <text x="86"  y="313" fontFamily="monospace" fontSize="8" fontWeight="700" fill="#111">TOTAL PROVENTOS</text>
                <text x="300" y="313" fontFamily="monospace" fontSize="8" fontWeight="700" fill="#111">TOTAL DESC. R$ 375,40</text>
                <text x="514" y="313" fontFamily="monospace" fontSize="8" fontWeight="700" fill="#111" textAnchor="end">LÍQ. R$ 1.639,25</text>

                {/* Scan bar — SMIL animates y in rotated local space, keeping it parallel to paper */}
                <rect x="68" y="60" width="468" height="26" fill="url(#tcScanGrad)" filter="url(#tcScanBlur)">
                  <animate attributeName="y" values="60;370;60" dur="4s" repeatCount="indefinite" calcMode="easeInOut" />
                </rect>
              </g>

              {/* ── Badge top-right — positive ─────────────────────────────── */}
              <g transform="translate(430, 38)">
                <rect width="152" height="50" rx="12" fill="white" filter="url(#tcBadgeShadow)" />
                <circle cx="27" cy="25" r="14" fill="#1B4332" />
                <text x="27" y="30" fontFamily="sans-serif" fontSize="14" fill="white" textAnchor="middle" fontWeight="700">✓</text>
                <text x="50" y="19" fontFamily="sans-serif" fontSize="9"    fill="#999">Cálculo INSS</text>
                <text x="50" y="34" fontFamily="sans-serif" fontSize="10.5" fill="#111" fontWeight="700">Dentro da lei</text>
              </g>

              {/* ── Badge bottom-left — alert ───────────────────────────────── */}
              <g transform="translate(6, 402)">
                <rect width="166" height="50" rx="12" fill="white" filter="url(#tcBadgeShadow)" />
                <circle cx="27" cy="25" r="14" fill="#8B1A1A" />
                <text x="27" y="30" fontFamily="sans-serif" fontSize="14" fill="white" textAnchor="middle" fontWeight="700">!</text>
                <text x="50" y="19" fontFamily="sans-serif" fontSize="9"    fill="#999">Adicional noturno</text>
                <text x="50" y="34" fontFamily="sans-serif" fontSize="10.5" fill="#8B1A1A" fontWeight="700">Falta R$ 38,16</text>
              </g>
            </svg>
          </div>
        </div>
      </section>

      {/* ── COMO FUNCIONA ──────────────────────────────────────────────────── */}
      <section className="bg-tc-paper border-y border-tc-line px-5 sm:px-14 py-20">
        <div className="max-w-[1440px] mx-auto">
          <h2 className="font-display text-4xl sm:text-5xl font-normal tracking-tight text-center">
            Três passos. <em className="text-tc-accent not-italic">Zero estresse.</em>
          </h2>
          <div className="grid md:grid-cols-3 gap-6 mt-14">
            {[
              { n: "01", t: "Foto ou upload", d: "Câmera do celular ou arquivo do portal. A gente aceita JPG, PNG, WebP e PDF." },
              { n: "02", t: "IA + lei CLT", d: "Conferimos cada verba: INSS, FGTS, hora extra, noturno, DSR — com a tabela 2026." },
              { n: "03", t: "Relatório claro", d: "Verde = certo. Vermelho = falta. Cada erro com o artigo exato da lei." },
            ].map((s) => (
              <div key={s.n} className="bg-tc-bg border border-tc-line rounded-2xl p-8">
                <div className="flex justify-between items-start mb-5">
                  <div className="w-12 h-12 bg-tc-green text-tc-paper rounded-xl grid place-items-center">
                    <span className="text-lg">{s.n === "01" ? "📷" : s.n === "02" ? "⚖️" : "📊"}</span>
                  </div>
                  <span className="text-xs text-tc-muted font-mono-tc">{s.n}</span>
                </div>
                <div className="font-display text-2xl font-medium tracking-tight">{s.t}</div>
                <p className="text-sm text-[var(--tc-ink-soft)] mt-2 leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CLT RIGHTS TABLE ───────────────────────────────────────────────── */}
      <section className="px-5 sm:px-14 py-20 max-w-[1440px] mx-auto">
        <div className="grid md:grid-cols-2 gap-20 items-center">
          <div>
            <div className="text-xs tracking-widest text-tc-accent font-bold mb-4">SEUS DIREITOS</div>
            <h2 className="font-display text-5xl font-normal tracking-tight leading-[1]">
              A CLT inteira,<br /><em className="not-italic text-tc-accent">ao seu lado.</em>
            </h2>
            <p className="text-base text-[var(--tc-ink-soft)] leading-relaxed mt-5 max-w-md">
              Oito pilares da legislação trabalhista brasileira — conferidos em cada holerite, com o artigo da lei na tela.
            </p>
          </div>
          <div className="bg-tc-paper border border-tc-line rounded-2xl overflow-hidden">
            {CLT_ITEMS.map((x, i) => (
              <div key={i} className={`flex justify-between items-center px-6 py-4 ${i < CLT_ITEMS.length - 1 ? "border-b border-tc-line" : ""}`}>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-tc-green/15 text-tc-green grid place-items-center text-xs font-bold">✓</div>
                  <span className="text-sm font-medium">{x.t}</span>
                </div>
                <span className="text-[11px] text-tc-muted font-mono-tc">{x.a}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ───────────────────────────────────────────────────── */}
      <section className="bg-secondary px-5 sm:px-14 py-20">
        <div className="max-w-[1440px] mx-auto">
          <h2 className="font-display text-4xl sm:text-5xl font-normal tracking-tight text-center">
            Quem já recebeu de volta.
          </h2>
          <div className="grid md:grid-cols-3 gap-6 mt-12">
            {TESTIMONIALS.map((tm, i) => (
              <figure key={i} className="bg-tc-paper border border-tc-line rounded-2xl p-8 m-0">
                <div className="flex gap-1 text-tc-accent mb-4 text-sm">★★★★★</div>
                <blockquote className="font-display text-xl font-normal leading-snug italic m-0 mb-5">
                  &ldquo;{tm.texto}&rdquo;
                </blockquote>
                <figcaption className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-tc-green text-tc-paper grid place-items-center font-display font-medium">
                    {tm.nome[0]}
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{tm.nome}</div>
                    <div className="text-xs text-tc-muted">{tm.cargo} · {tm.cidade}</div>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECURITY ───────────────────────────────────────────────────────── */}
      <section className="px-5 sm:px-14 py-20 max-w-[1440px] mx-auto">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div className="bg-tc-green text-tc-paper rounded-2xl p-12">
            <span className="text-3xl">🔒</span>
            <div className="font-display text-3xl font-normal tracking-tight mt-4 leading-tight">
              Seus dados são <em className="not-italic text-tc-accent">seus</em>.
            </div>
            <p className="text-sm leading-relaxed mt-4 text-white/80">
              Holerite criptografado em trânsito e em repouso, apagado em 24h. Nunca compartilhado com seu empregador. Código do motor de cálculo público no GitHub.
            </p>
          </div>
          <div className="grid gap-4">
            {SECURITY_ITEMS.map((c, i) => (
              <div key={i} className="flex gap-4 items-start bg-tc-paper border border-tc-line rounded-xl p-5">
                <div className="w-10 h-10 rounded-xl bg-tc-accent/15 text-tc-accent grid place-items-center text-lg flex-shrink-0">
                  {["🔐", "🕵️", "📖", "🛡️"][i]}
                </div>
                <div>
                  <div className="font-semibold text-sm">{c.t}</div>
                  <div className="text-xs text-[var(--tc-ink-soft)] mt-1">{c.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ──────────────────────────────────────────────────────── */}
      <section className="bg-tc-green text-tc-paper px-5 sm:px-14 py-24 text-center">
        <div className="text-xs tracking-widest text-tc-accent font-bold mb-4">PRÓXIMO PASSO</div>
        <h2 className="font-display text-5xl sm:text-6xl font-normal tracking-tight leading-[1] max-w-3xl mx-auto">
          Todo mês conta. <em className="text-tc-accent">Confere o seu.</em>
        </h2>
        <CtaLink href="/audit/new" location="final" className="mt-10 bg-tc-accent text-white rounded-full px-9 py-5 text-base font-semibold hover:bg-[#b56e3e] transition-colors inline-flex items-center gap-2">
          Conferir meu holerite agora →
        </CtaLink>
        <div className="mt-4 text-sm text-white/60">Gratuito · 30 segundos · Sem cadastro</div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer className="px-5 sm:px-14 py-12 bg-tc-bg border-t border-tc-line">
        <div className="max-w-[1440px] mx-auto grid md:grid-cols-4 gap-10">
          <div className="md:col-span-1">
            <span className="font-display text-xl font-medium">Tá Certo.</span>
            <p className="text-xs text-tc-muted leading-relaxed mt-3 max-w-xs">
              Ferramenta de conferência CLT. Não é consultoria jurídica. Para ações, procure um sindicato ou advogado trabalhista.
            </p>
          </div>
          {[
            ["Produto", [{ l: "Como funciona", h: "#como-funciona" }, { l: "Conferir grátis", h: "/audit/new" }]],
            ["Legal", [{ l: "Termos", h: "/termos" }, { l: "Privacidade", h: "/privacidade" }, { l: "LGPD", h: "/privacidade" }]],
            ["Acesso", [{ l: "Entrar", h: "/login" }, { l: "Novo holerite", h: "/audit/new" }]],
          ].map(([title, links]) => (
            <div key={title as string}>
              <div className="text-xs tracking-widest text-[var(--tc-ink-soft)] font-bold mb-3">{(title as string).toUpperCase()}</div>
              {(links as { l: string; h: string }[]).map((x) => (
                <Link key={x.l} href={x.h} className="block text-sm text-[var(--tc-ink-soft)] py-1 hover:text-tc-ink transition-colors">{x.l}</Link>
              ))}
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
