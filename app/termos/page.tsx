import Link from "next/link";

export const metadata = {
  title: "Termos de Uso — Tá Certo?",
};

export default function TermosPage() {
  return (
    <LegalLayout title="Termos de Uso" updated="Janeiro de 2026">

      <Section title="1. O que é o Tá Certo?">
        <p>
          O <strong>Tá Certo?</strong> é uma ferramenta digital de conferência de cálculos
          trabalhistas. A partir da imagem ou PDF do seu holerite, extraímos os dados por OCR,
          interpretamos o conteúdo com inteligência artificial e comparamos cada verba com as
          tabelas e regras da Consolidação das Leis do Trabalho (CLT) e legislação complementar
          vigente.
        </p>
      </Section>

      <Section title="2. Natureza do serviço — não é assessoria jurídica">
        <p>
          Os resultados gerados pelo Tá Certo? são <strong>estimativas automatizadas</strong>{" "}
          baseadas nas informações fornecidas pelo usuário e nas tabelas CLT vigentes na data da
          análise. O serviço:
        </p>
        <ul>
          <li>
            <strong>Não constitui</strong> assessoria jurídica, contábil, trabalhista ou de
            qualquer outra natureza profissional regulamentada.
          </li>
          <li>
            <strong>Não substitui</strong> a análise de um advogado trabalhista, contador ou
            auditor.
          </li>
          <li>
            Pode apresentar <strong>divergências</strong> em casos atípicos, acordos coletivos,
            convenções sindicais ou situações não cobertas pelos cálculos padrão.
          </li>
        </ul>
        <Callout>
          Em caso de divergência com seu empregador, procure seu sindicato de categoria ou um
          advogado trabalhista antes de tomar qualquer medida.
        </Callout>
      </Section>

      <Section title="3. Precisão dos resultados">
        <p>
          Os cálculos são realizados com base nas tabelas de INSS, IRRF e FGTS publicadas pelos
          órgãos competentes para o ano vigente. Nos empenhamos em manter as tabelas atualizadas,
          porém:
        </p>
        <ul>
          <li>Não garantimos precisão absoluta em 100% dos casos.</li>
          <li>
            Situações como afastamentos, licenças, horas negativas, banco de horas e acordos
            individuais podem não ser contempladas.
          </li>
          <li>
            O usuário é responsável por verificar se os dados do holerite foram corretamente
            capturados pelo OCR antes de usar o resultado como base para qualquer ação.
          </li>
        </ul>
      </Section>

      <Section title="4. Tratamento dos dados do holerite">
        <p>
          Levamos a privacidade a sério. Veja como tratamos a imagem e os dados do seu holerite:
        </p>
        <ul>
          <li>
            A <strong>imagem ou PDF</strong> enviado é processado em memória (OCR e IA) e{" "}
            <strong>não é armazenado permanentemente</strong> em nossos servidores após o
            processamento.
          </li>
          <li>
            O <strong>texto extraído</strong> pelo OCR é utilizado exclusivamente para gerar a
            análise e não é retido após a conclusão.
          </li>
          <li>
            O <strong>resultado estruturado</strong> da auditoria (valores calculados e
            divergências) pode ser salvo na sua conta, se você optar por isso.
          </li>
        </ul>
      </Section>

      <Section title="5. Cadastro e uso gratuito">
        <p>
          A primeira auditoria é gratuita, sem necessidade de cadastro. Para salvar resultados e
          acessar o histórico, é necessário criar uma conta com e-mail (autenticação por magic
          link — sem senha).
        </p>
      </Section>

      <Section title="6. Assinatura">
        <p>
          O plano pago, quando disponível, é cobrado mensalmente. O cancelamento pode ser
          realizado <strong>a qualquer momento</strong>, sem multa ou carência, com efeito ao
          final do período já pago.
        </p>
      </Section>

      <Section title="7. Limitação de responsabilidade">
        <p>
          O Tá Certo? não se responsabiliza por perdas, danos ou decisões tomadas com base nos
          resultados gerados pela plataforma. O uso do serviço implica ciência e aceitação de
          que os resultados são estimativas automatizadas sujeitas a erros.
        </p>
      </Section>

      <Section title="8. Modificações">
        <p>
          Estes termos podem ser atualizados a qualquer momento. A data de atualização será
          exibida nesta página. O uso continuado do serviço após alterações implica aceitação
          dos novos termos.
        </p>
      </Section>

      <Section title="9. Contato">
        <p>
          Dúvidas sobre estes termos:{" "}
          <a href="mailto:contato@tacerto.com.br" className="text-green-700 underline">
            contato@tacerto.com.br
          </a>
        </p>
      </Section>

    </LegalLayout>
  );
}

// ── Componentes internos ──────────────────────────────────────────────────────

function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col">
      <header className="bg-white border-b px-5 py-3 flex items-center justify-between">
        <Link href="/" className="font-bold text-green-700 text-lg tracking-tight">
          Tá Certo?
        </Link>
        <Link href="/audit/new" className="text-sm text-green-600 hover:underline">
          Auditar holerite
        </Link>
      </header>

      <main className="flex-1 px-5 py-10 max-w-2xl mx-auto w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{title}</h1>
        <p className="text-xs text-gray-400 mb-10">Última atualização: {updated}</p>

        <div className="space-y-8 text-sm text-gray-700 leading-relaxed">
          {children}
        </div>
      </main>

      <footer className="border-t bg-white px-5 py-6 text-xs text-gray-400 max-w-2xl mx-auto w-full">
        <div className="flex gap-6">
          <Link href="/termos" className="hover:text-gray-600">Termos de Uso</Link>
          <Link href="/privacidade" className="hover:text-gray-600">Política de Privacidade</Link>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-gray-900 mb-3">{title}</h2>
      <div className="space-y-3 [&_ul]:mt-2 [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:marker:text-gray-400">
        {children}
      </div>
    </section>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-800 text-sm mt-3">
      {children}
    </div>
  );
}
