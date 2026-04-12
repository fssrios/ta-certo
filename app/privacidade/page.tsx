import Link from "next/link";

export const metadata = {
  title: "Política de Privacidade — Tá Certo?",
};

export default function PrivacidadePage() {
  return (
    <LegalLayout title="Política de Privacidade" updated="Janeiro de 2026">

      <Section title="1. Quem somos — controlador de dados">
        <p>
          Esta política aplica-se à plataforma <strong>Tá Certo?</strong>, serviço de
          conferência automatizada de holerites CLT.
        </p>
        <Table
          rows={[
            ["Controlador", "[Nome / Razão Social — preencher]"],
            ["CNPJ", "[CNPJ — preencher quando disponível]"],
            ["E-mail de contato", "privacidade@tacerto.com.br"],
          ]}
        />
        <p className="text-xs text-gray-400 mt-1">
          Enquanto o CNPJ não estiver disponível, o responsável é o desenvolvedor e operador
          da plataforma.
        </p>
      </Section>

      <Section title="2. Quais dados coletamos">
        <Table
          header={["Dado", "Finalidade", "Armazenado?"]}
          rows={[
            ["E-mail", "Autenticação (magic link)", "Sim — na conta Supabase"],
            ["Imagem / PDF do holerite", "OCR e extração de texto", "Não — processado em memória"],
            ["Texto extraído (OCR)", "Interpretação pela IA", "Não — descartado após análise"],
            ["Resultado da auditoria", "Histórico e comparativos", "Sim — se usuário salvar"],
            ["Dados de uso", "Melhorias do produto", "Sim — anonimizados"],
          ]}
        />
      </Section>

      <Section title="3. Imagens de holerite — tratamento em memória">
        <p>
          A imagem ou PDF enviado percorre o seguinte caminho:
        </p>
        <ol className="mt-2 space-y-2 pl-5 list-decimal marker:text-gray-400">
          <li>
            É convertida para base64 <strong>no próprio dispositivo do usuário</strong> (client-side).
          </li>
          <li>
            É enviada ao servidor exclusivamente para processamento OCR via Google Cloud Vision API.
          </li>
          <li>
            O texto extraído é enviado à API da Anthropic (Claude) para interpretação.
          </li>
          <li>
            Após a análise, <strong>a imagem não é retida</strong> em nenhum de nossos servidores
            ou buckets de armazenamento.
          </li>
        </ol>
        <Callout>
          O conteúdo do seu holerite (valores, nome, CPF) pode trafegar pelos serviços de
          terceiros (Google e Anthropic) conforme suas respectivas políticas de privacidade.
          Não enviamos dados identificáveis além do necessário para o processamento.
        </Callout>
      </Section>

      <Section title="4. Base legal (LGPD — Lei 13.709/2018)">
        <p>
          O tratamento dos seus dados é fundamentado nas seguintes bases legais previstas no
          art. 7º da LGPD:
        </p>
        <ul>
          <li>
            <strong>Consentimento do titular</strong> (art. 7º, I) — ao utilizar o serviço e
            aceitar estes termos, o usuário consente com o tratamento descrito nesta política.
          </li>
          <li>
            <strong>Execução de contrato</strong> (art. 7º, V) — para prestação do serviço de
            auditoria contratado.
          </li>
          <li>
            <strong>Legítimo interesse</strong> (art. 7º, IX) — para melhorias de segurança e
            qualidade do serviço, de forma anonimizada.
          </li>
        </ul>
      </Section>

      <Section title="5. Compartilhamento com terceiros">
        <Table
          header={["Terceiro", "Finalidade", "Dados compartilhados"]}
          rows={[
            ["Supabase", "Banco de dados e autenticação", "E-mail, resultado da auditoria"],
            ["Google Cloud Vision", "OCR da imagem", "Imagem do holerite (temporário)"],
            ["Anthropic (Claude)", "Interpretação do texto", "Texto extraído pelo OCR (temporário)"],
            ["Vercel", "Hospedagem e CDN", "Logs de acesso anonimizados"],
          ]}
        />
        <p>
          Não vendemos, alugamos ou compartilhamos seus dados pessoais com terceiros para fins
          de marketing ou qualquer finalidade não descrita acima.
        </p>
      </Section>

      <Section title="6. Seus direitos como titular (LGPD, art. 18)">
        <p>Você tem direito a, a qualquer momento:</p>
        <ul>
          <li><strong>Acesso</strong> — confirmar se tratamos seus dados e obter uma cópia.</li>
          <li><strong>Correção</strong> — solicitar atualização de dados incompletos ou incorretos.</li>
          <li>
            <strong>Exclusão</strong> — pedir a eliminação dos dados tratados com base em consentimento.
          </li>
          <li>
            <strong>Portabilidade</strong> — receber seus dados em formato estruturado e legível.
          </li>
          <li>
            <strong>Revogação do consentimento</strong> — retirar o consentimento a qualquer momento,
            sem prejuízo dos tratamentos já realizados.
          </li>
        </ul>
        <p>
          Para exercer qualquer destes direitos, envie um e-mail para{" "}
          <a href="mailto:privacidade@tacerto.com.br" className="text-green-700 underline">
            privacidade@tacerto.com.br
          </a>{" "}
          com o assunto "Direitos LGPD". Respondemos em até 15 dias úteis.
        </p>
      </Section>

      <Section title="7. Retenção dos dados">
        <ul>
          <li>
            <strong>Conta e e-mail:</strong> mantidos enquanto a conta estiver ativa. Excluídos
            em até 30 dias após solicitação de exclusão.
          </li>
          <li>
            <strong>Resultados de auditoria:</strong> mantidos enquanto a conta estiver ativa ou
            até solicitação de exclusão.
          </li>
          <li>
            <strong>Imagens de holerite:</strong> não armazenadas — descartadas após processamento.
          </li>
          <li>
            <strong>Logs de acesso:</strong> retidos por até 6 meses para fins de segurança.
          </li>
        </ul>
      </Section>

      <Section title="8. Segurança">
        <p>
          Adotamos medidas técnicas e organizacionais adequadas para proteger seus dados, incluindo:
          comunicação criptografada (HTTPS/TLS), autenticação sem senha (magic link),
          Row Level Security no banco de dados (cada usuário acessa apenas seus próprios dados)
          e acesso restrito a credenciais de terceiros.
        </p>
      </Section>

      <Section title="9. Cookies e rastreamento">
        <p>
          Utilizamos apenas cookies estritamente necessários para manter a sessão autenticada
          (via Supabase). Não utilizamos cookies de rastreamento, publicidade ou analytics de
          terceiros.
        </p>
      </Section>

      <Section title="10. Alterações nesta política">
        <p>
          Esta política pode ser atualizada periodicamente. Notificaremos usuários cadastrados
          por e-mail em caso de alterações relevantes. A data de atualização é sempre exibida
          no topo desta página.
        </p>
      </Section>

      <Section title="11. Contato e encarregado (DPO)">
        <p>
          Para questões relacionadas à privacidade e proteção de dados:
        </p>
        <Table
          rows={[
            ["E-mail", "privacidade@tacerto.com.br"],
            ["Assunto sugerido", "Direitos LGPD / Privacidade"],
            ["Prazo de resposta", "Até 15 dias úteis"],
          ]}
        />
        <p>
          Você também pode registrar reclamações junto à{" "}
          <strong>Autoridade Nacional de Proteção de Dados (ANPD)</strong> em{" "}
          <a
            href="https://www.gov.br/anpd"
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-700 underline"
          >
            gov.br/anpd
          </a>
          .
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
      <div className="space-y-3 [&_ul]:mt-2 [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:marker:text-gray-400 [&_ol]:marker:text-gray-400">
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

function Table({
  header,
  rows,
}: {
  header?: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto mt-2 rounded-xl border border-gray-200">
      <table className="w-full text-xs">
        {header && (
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {header.map((h) => (
                <th key={h} className="text-left px-4 py-2.5 font-semibold text-gray-600">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, i) => (
            <tr key={i} className="bg-white">
              {row.map((cell, j) => (
                <td key={j} className={`px-4 py-3 ${j === 0 ? "font-medium text-gray-700" : "text-gray-500"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
