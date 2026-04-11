import Link from "next/link";

// Estatísticas — substituir por dados reais via DB quando houver volume
const STATS = {
  totalErros: "R$ 48.320",
  totalUsuarios: "312",
  percentualErros: 43,
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col">

      {/* ── NAV ─────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b px-5 py-3 flex items-center justify-between">
        <span className="font-bold text-lg text-green-700 tracking-tight">Tá Certo?</span>
        <Link
          href="/login"
          className="text-sm font-medium text-gray-600 hover:text-green-700 transition-colors"
        >
          Entrar
        </Link>
      </header>

      <main className="flex-1">

        {/* ── HERO ────────────────────────────────────────────────────────────── */}
        <section className="px-5 pt-14 pb-16 text-center max-w-lg mx-auto">
          {/* badge */}
          <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            Gratuito na primeira auditoria
          </div>

          <h1 className="text-[2.6rem] font-extrabold leading-[1.1] tracking-tight text-gray-900">
            Seu empregador está<br />
            <span className="text-[#DC2626]">te pagando certo?</span>
          </h1>

          <p className="mt-5 text-lg text-gray-500 leading-relaxed">
            Tire foto do seu holerite.<br />
            Descubra em 30 segundos.
          </p>

          <Link
            href="/audit/new"
            className="mt-8 block w-full rounded-2xl bg-[#16A34A] py-4 text-base font-bold text-white
                       hover:bg-green-700 active:bg-green-800 transition-colors shadow-lg shadow-green-200"
          >
            Auditar meu holerite agora — grátis
          </Link>

          {/* social counter */}
          <p className="mt-4 text-sm text-gray-400">
            Já encontramos{" "}
            <strong className="text-gray-700">{STATS.totalErros} em erros</strong>{" "}
            para{" "}
            <strong className="text-gray-700">{STATS.totalUsuarios} trabalhadores</strong>
          </p>
        </section>

        {/* ── COMO FUNCIONA ────────────────────────────────────────────────────── */}
        <section className="bg-[#F9FAFB] px-5 py-14">
          <div className="max-w-lg mx-auto">
            <h2 className="text-2xl font-bold text-center text-gray-900 mb-10">
              Como funciona
            </h2>

            <ol className="space-y-6">
              {[
                {
                  n: "1",
                  icon: "📷",
                  title: "Tire foto do holerite",
                  desc: "Câmera do celular, upload de imagem ou PDF — qualquer formato.",
                },
                {
                  n: "2",
                  icon: "🤖",
                  title: "IA analisa cada linha",
                  desc: "Nossa IA lê o texto, identifica cada verba e confere com as tabelas CLT 2026.",
                },
                {
                  n: "3",
                  icon: "🚦",
                  title: "Veja se estão te pagando certo",
                  desc: "Cada linha fica verde ou vermelho. Você vê exatamente quanto está faltando.",
                },
              ].map(({ n, icon, title, desc }) => (
                <li key={n} className="flex gap-4 items-start">
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-white border-2 border-green-200 flex items-center justify-center font-bold text-green-700 text-sm shadow-sm">
                    {n}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl" aria-hidden>{icon}</span>
                      <p className="font-semibold text-gray-900">{title}</p>
                    </div>
                    <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-10 text-center">
              <Link
                href="/audit/new"
                className="inline-block rounded-2xl bg-[#16A34A] px-8 py-3.5 text-sm font-bold text-white
                           hover:bg-green-700 transition-colors"
              >
                Começar agora — grátis
              </Link>
            </div>
          </div>
        </section>

        {/* ── PROVA SOCIAL ────────────────────────────────────────────────────── */}
        <section className="px-5 py-14 max-w-lg mx-auto">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-8">
            Números que importam
          </h2>

          <div className="grid grid-cols-2 gap-4 mb-10">
            <div className="bg-[#FEF2F2] rounded-2xl p-5 text-center">
              <p className="text-4xl font-extrabold text-[#DC2626]">
                {STATS.percentualErros}%
              </p>
              <p className="text-xs text-red-700 mt-1 leading-snug">
                dos holerites analisados tinham pelo menos 1 erro
              </p>
            </div>
            <div className="bg-[#F0FDF4] rounded-2xl p-5 text-center">
              <p className="text-4xl font-extrabold text-[#16A34A]">30s</p>
              <p className="text-xs text-green-700 mt-1 leading-snug">
                é o tempo médio para ter o resultado completo
              </p>
            </div>
            <div className="bg-[#F0FDF4] rounded-2xl p-5 text-center">
              <p className="text-3xl font-extrabold text-[#16A34A]">CLT</p>
              <p className="text-xs text-green-700 mt-1 leading-snug">
                tabelas 2026 de INSS, IRRF e FGTS sempre atualizadas
              </p>
            </div>
            <div className="bg-[#FEF2F2] rounded-2xl p-5 text-center">
              <p className="text-3xl font-extrabold text-[#DC2626]">
                {STATS.totalErros}
              </p>
              <p className="text-xs text-red-700 mt-1 leading-snug">
                já encontramos em cobranças indevidas
              </p>
            </div>
          </div>

          {/* Depoimentos — placeholder até ter reais */}
          <div className="space-y-4">
            {[
              {
                text: "\"Meu INSS estava sendo descontado errado faz 3 meses. Consegui pedir o ressarcimento no RH com o relatório do Tá Certo?\"",
                name: "M.S.",
                role: "Analista de TI, SP",
              },
              {
                text: "\"Simples demais. Tirei foto com o celular, em 40 segundos apareceu tudo. Tinha R$ 87 de diferença no IRRF.\"",
                name: "R.O.",
                role: "Técnica de enfermagem, RJ",
              },
            ].map(({ text, name, role }) => (
              <figure
                key={name}
                className="bg-[#F9FAFB] rounded-2xl p-5 border border-gray-100"
              >
                <blockquote className="text-sm text-gray-700 leading-relaxed">
                  {text}
                </blockquote>
                <figcaption className="mt-3 text-xs text-gray-400 font-medium">
                  {name} · {role}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* ── PREÇO ────────────────────────────────────────────────────────────── */}
        <section className="bg-[#F9FAFB] px-5 py-14">
          <div className="max-w-lg mx-auto">
            <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">
              Preço simples e justo
            </h2>
            <p className="text-center text-sm text-gray-500 mb-8">
              Sem surpresas. Sem cartão de crédito na primeira auditoria.
            </p>

            <div className="space-y-4">
              {/* Free */}
              <div className="bg-white rounded-2xl border-2 border-green-200 p-6 relative overflow-hidden">
                <div className="absolute top-4 right-4 text-xs font-bold bg-green-100 text-green-700 px-2.5 py-1 rounded-full">
                  Agora
                </div>
                <p className="text-xl font-bold text-gray-900 mb-1">Grátis</p>
                <p className="text-sm text-gray-500 mb-4">
                  Primeira auditoria sem criar conta.
                </p>
                <ul className="space-y-2 text-sm text-gray-700">
                  {[
                    "1 auditoria completa",
                    "Resultado detalhado por linha",
                    "Imagem para compartilhar",
                    "Relatório para o RH",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <span className="text-green-500 font-bold">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/audit/new"
                  className="mt-6 block text-center rounded-xl bg-[#16A34A] py-3 text-sm font-bold text-white
                             hover:bg-green-700 transition-colors"
                >
                  Começar agora
                </Link>
              </div>

              {/* Pro */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 relative overflow-hidden">
                <div className="absolute top-4 right-4 text-xs font-bold bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">
                  Em breve
                </div>
                <p className="text-xl font-bold text-gray-900 mb-0.5">
                  R$&nbsp;9,99
                  <span className="text-sm font-normal text-gray-500">/mês</span>
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  Para quem quer acompanhar todo mês.
                </p>
                <ul className="space-y-2 text-sm text-gray-700">
                  {[
                    "Auditorias ilimitadas",
                    "Histórico completo",
                    "Comparativo mês a mês",
                    "Alerta de divergência automático",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <span className="text-gray-400 font-bold">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="mt-6 block text-center rounded-xl border border-gray-200 py-3 text-sm font-bold text-gray-400">
                  Lista de espera
                </div>
              </div>
            </div>

            {/* Garantia */}
            <div className="mt-6 bg-white border border-dashed border-gray-200 rounded-2xl px-5 py-4 flex items-start gap-3">
              <span className="text-2xl flex-shrink-0" aria-hidden>🛡️</span>
              <p className="text-sm text-gray-600">
                <strong>Sem risco.</strong>{" "}
                Se a análise não encontrar nenhuma divergência no seu holerite, você não paga nada — e fica com a certeza de que está tudo certo.
              </p>
            </div>
          </div>
        </section>

        {/* ── CTA FINAL ────────────────────────────────────────────────────────── */}
        <section className="px-5 py-16 text-center max-w-lg mx-auto">
          <p className="text-2xl font-bold text-gray-900 mb-2">
            Seu dinheiro pode estar sumindo todo mês
          </p>
          <p className="text-gray-500 text-sm mb-8">
            Em média, trabalhadores com erros no holerite perdem R$&nbsp;156/mês sem saber.
          </p>
          <Link
            href="/audit/new"
            className="block rounded-2xl bg-[#DC2626] py-4 text-base font-bold text-white
                       hover:bg-red-700 active:bg-red-800 transition-colors shadow-lg shadow-red-100"
          >
            Descobrir agora — é grátis
          </Link>
          <p className="mt-3 text-xs text-gray-400">Sem cadastro. Resultado em 30 segundos.</p>
        </section>

      </main>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer className="border-t bg-white px-5 py-8">
        <div className="max-w-lg mx-auto">
          <p className="font-bold text-green-700 mb-3">Tá Certo?</p>
          <p className="text-xs text-gray-400 leading-relaxed mb-4">
            Tá Certo? é uma ferramenta de conferência de cálculos baseada na legislação CLT
            vigente. <strong>Não constitui assessoria jurídica, contábil ou trabalhista.</strong>{" "}
            Para disputas e ações judiciais, consulte um advogado trabalhista.
          </p>
          <div className="flex flex-wrap gap-4 text-xs text-gray-400">
            <Link href="/termos" className="hover:text-gray-600 transition-colors">
              Termos de Uso
            </Link>
            <Link href="/privacidade" className="hover:text-gray-600 transition-colors">
              Política de Privacidade
            </Link>
            <Link href="/login" className="hover:text-gray-600 transition-colors">
              Entrar
            </Link>
          </div>
          <p className="text-xs text-gray-300 mt-4">
            © {new Date().getFullYear()} Tá Certo? — Todos os direitos reservados.
          </p>
        </div>
      </footer>

    </div>
  );
}
