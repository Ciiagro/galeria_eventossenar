"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { mascaraCpf } from "@/lib/mascaras";

type EscolaTermo = {
  escola_id: string; nome: string; tipo?: string | null; endereco?: string | null; quantidade_professores: number;
  matricula_infantil_3: number; matricula_infantil_4: number; matricula_infantil_5: number;
};
type Adesao = Record<string, any> & { escolas: EscolaTermo[]; coordenador?: Record<string, string> | null };

const VERDE = "#2F6B4F";
const VERDE_ESCURO = "#1E4632";

function Campo({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <div className="break-inside-avoid">
      <span className="block text-[9px] uppercase tracking-wide text-[#6E6555]">{rotulo}</span>
      <span className="text-[12px] font-bold">{valor || "—"}</span>
    </div>
  );
}

function Secao({ n, titulo }: { n: number; titulo: string }) {
  return (
    <h2 className="mb-2.5 mt-5 break-after-avoid border-l-4 bg-[#F1EFE3] px-2.5 py-1.5 text-[13px] font-bold" style={{ borderColor: VERDE, color: VERDE_ESCURO }}>
      {n}. {titulo}
    </h2>
  );
}

function Assinatura({ nome, cargo, assinadoEm }: { nome?: string | null; cargo: string; assinadoEm?: string | null }) {
  return (
    <div className="break-inside-avoid pt-9">
      <div className="border-t border-[#2A2620] pt-1">
        {nome ? <div className="text-[12px] font-bold">{nome}</div> : <div className="h-[14px]" />}
        <div className="text-[10px] text-[#6E6555]">{cargo}</div>
        {assinadoEm && (
          <div className="mt-0.5 text-[10px] font-semibold" style={{ color: VERDE }}>
            ✓ Assinado eletronicamente em {new Date(assinadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </div>
        )}
      </div>
    </div>
  );
}

function dataBr(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString("pt-BR");
}

export type AssinaturaTermo = { papel: string; nome?: string; cpf?: string | null; assinado_em?: string | null };

// O documento em si (cabeçalho, seções, termo e assinaturas). Usado pela tela de impressão (TermoDocumento)
// e pela página pública em que prefeito, sindicato e coordenador assinam por e-mail.
export function TermoConteudo({ a, assinaturas }: { a: Adesao; assinaturas?: AssinaturaTermo[] }) {
  const c = a.coordenador;
  const somaSerie = (k: "matricula_infantil_3" | "matricula_infantil_4" | "matricula_infantil_5") => a.escolas.reduce((t, e) => t + (e[k] || 0), 0);
  const t3 = somaSerie("matricula_infantil_3"), t4 = somaSerie("matricula_infantil_4"), t5 = somaSerie("matricula_infantil_5");
  const totalProf = a.escolas.reduce((t, e) => t + (e.quantidade_professores || 0), 0);
  const ano = a.ciclo_nome ?? "";
  const aprovada = a.status === "aprovada" ? dataBr(a.aprovada_em) : null;

  const quando = (papel: string) => assinaturas?.find((x) => x.papel === papel)?.assinado_em ?? null;

  return (
    <article className="mx-auto w-full max-w-[210mm] bg-white px-[14mm] py-[12mm] text-[#2A2620] shadow-lg print:max-w-none print:p-0 print:shadow-none">
      <header className="mb-4 border-b-[3px] pb-3" style={{ borderColor: VERDE }}>
        <div className="mb-3 flex items-center justify-between">
          <img src="/logo-senar-termo.png" alt="SENAR" width={370} height={140} className="h-11 w-auto" />
          <img src="/logo-valores-termo.png" alt="Projeto Valores — Brincando e cultivando os valores humanos" width={298} height={136} className="h-11 w-auto" />
        </div>
        <span className="mb-2 inline-block rounded px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-white" style={{ background: VERDE }}>FAEC · SENAR CEARÁ</span>
        <h1 className="text-[20px] font-bold leading-tight" style={{ color: VERDE_ESCURO }}>Termo de Adesão · Projeto Valores {ano && `· ${ano}`}</h1>
        <p className="text-[11px] text-[#6E6555]">Projeto Valores Humanos — Brincando e cultivando os valores humanos</p>
      </header>

      <Secao n={1} titulo="Identificação do Município" />
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        <Campo rotulo="Município" valor={a.municipio_nome ? `${a.municipio_nome} - CE` : null} />
        <Campo rotulo="Prefeito(a)" valor={a.prefeito_nome} />
        <Campo rotulo="RG do Prefeito(a)" valor={a.prefeito_rg} />
        <Campo rotulo="CPF do Prefeito(a)" valor={a.prefeito_cpf ? mascaraCpf(a.prefeito_cpf) : null} />
        <Campo rotulo="Endereço da Prefeitura" valor={a.prefeitura_endereco} />
        <Campo rotulo="CEP" valor={a.prefeitura_cep} />
        <Campo rotulo="Telefone" valor={a.prefeitura_telefone} />
        <Campo rotulo="E-mail" valor={a.prefeitura_email} />
      </div>

      <Secao n={2} titulo="Secretaria de Educação" />
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        <Campo rotulo="Secretário(a)" valor={a.secretario_nome} />
        <Campo rotulo="CPF" valor={a.secretario_cpf ? mascaraCpf(a.secretario_cpf) : null} />
        <Campo rotulo="Endereço" valor={a.secretaria_endereco} />
        <Campo rotulo="Contato" valor={a.secretaria_telefone} />
        <Campo rotulo="E-mail" valor={a.secretaria_email} />
      </div>

      <Secao n={3} titulo="Coordenador(a) do Projeto" />
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        <Campo rotulo="Nome" valor={c?.nome} />
        <Campo rotulo="E-mail" valor={c?.email} />
        <Campo rotulo="RG" valor={c?.rg} />
        <Campo rotulo="CPF" valor={c?.cpf ? mascaraCpf(c.cpf) : null} />
        <Campo rotulo="Telefone(s)" valor={[c?.telefone1, c?.telefone2].filter(Boolean).join(" / ")} />
      </div>

      <Secao n={4} titulo="Censo da Rede Municipal (escolas participantes)" />
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        <Campo rotulo="Total de escolas participantes" valor={String(a.escolas.length)} />
        <Campo rotulo="Total de professores" valor={String(totalProf)} />
      </div>
      <table className="mt-2.5 w-full break-inside-avoid border-collapse text-center text-[11px]">
        <thead>
          <tr className="bg-[#F1EFE3]" style={{ color: VERDE_ESCURO }}>
            {["Infantil 3", "Infantil 4", "Infantil 5", "Total de alunos"].map((h) => <th key={h} className="border border-[#D8D0B8] px-2 py-1">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-[#D8D0B8] px-2 py-1 font-bold">{t3}</td>
            <td className="border border-[#D8D0B8] px-2 py-1 font-bold">{t4}</td>
            <td className="border border-[#D8D0B8] px-2 py-1 font-bold">{t5}</td>
            <td className="border border-[#D8D0B8] bg-[#FBFAF3] px-2 py-1 font-bold">{t3 + t4 + t5}</td>
          </tr>
        </tbody>
      </table>

      <Secao n={5} titulo="Escolas participantes" />
      {a.escolas.length === 0 ? (
        <p className="text-[12px]">Nenhuma escola cadastrada nesta adesão.</p>
      ) : (
        a.escolas.map((e, i) => (
          <div key={e.escola_id} className="mb-2.5 break-inside-avoid rounded-md border border-[#D8D0B8] px-3 py-2">
            <h3 className="text-[12px] font-bold" style={{ color: VERDE_ESCURO }}>{i + 1}. {e.nome}</h3>
            {(e.tipo || e.endereco) && <p className="text-[10.5px] text-[#4A453A]">{[e.tipo, e.endereco].filter(Boolean).join(" · ")}</p>}
            <table className="mt-1.5 w-full border-collapse text-center text-[10.5px]">
              <thead>
                <tr className="bg-[#F1EFE3]" style={{ color: VERDE_ESCURO }}>
                  {["Professores", "Infantil 3", "Infantil 4", "Infantil 5", "Total de alunos"].map((h) => <th key={h} className="border border-[#D8D0B8] px-1.5 py-0.5">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-[#D8D0B8] px-1.5 py-0.5">{e.quantidade_professores}</td>
                  <td className="border border-[#D8D0B8] px-1.5 py-0.5">{e.matricula_infantil_3}</td>
                  <td className="border border-[#D8D0B8] px-1.5 py-0.5">{e.matricula_infantil_4}</td>
                  <td className="border border-[#D8D0B8] px-1.5 py-0.5">{e.matricula_infantil_5}</td>
                  <td className="border border-[#D8D0B8] bg-[#FBFAF3] px-1.5 py-0.5 font-bold">{e.matricula_infantil_3 + e.matricula_infantil_4 + e.matricula_infantil_5}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ))
      )}

      <div className="break-before-page">
        <Secao n={6} titulo="Termo de Adesão e Compromisso" />
        <div className="rounded-md border border-[#E1D8C0] bg-[#FBFAF3] px-4 py-3 text-[12px] leading-relaxed">
          Pelo presente termo, o município de <strong>{a.municipio_nome}</strong>, por meio de seus representantes abaixo assinados, formaliza
          sua adesão ao <strong>Projeto Valores</strong>{ano && <> para o ciclo <strong>{ano}</strong></>}, comprometendo-se a viabilizar a execução do
          programa junto às escolas listadas neste documento, garantindo a participação de gestores, professores e alunos nas atividades previstas,
          bem como o correto envio das informações de acompanhamento solicitadas pela coordenação do projeto.
        </div>

        <div className="mt-2.5 break-inside-avoid rounded-md border border-[#E1D8C0] bg-[#FBFAF3] px-4 py-3 text-[12px] leading-relaxed">
          <strong>Da veracidade e do uso dos dados.</strong> O município declara que as informações prestadas neste Termo são verdadeiras e
          atualizadas, responsabilizando-se por sua exatidão e por comunicar eventuais alterações à coordenação do projeto. Os dados pessoais aqui
          informados serão tratados pela FAEC/SENAR exclusivamente para as finalidades do Projeto Valores, em conformidade com a Lei nº 13.709/2018
          (LGPD). A informação inverídica poderá ensejar a suspensão ou o cancelamento da adesão.
        </div>

        <p className="mb-1 mt-5 text-[11px] font-bold text-[#6E6555]">Assinaturas</p>
        <div className="grid grid-cols-2 gap-x-6">
          <Assinatura nome={a.prefeito_nome} cargo={`Prefeito(a) Municipal${a.prefeito_cpf ? ` — CPF ${mascaraCpf(a.prefeito_cpf)}` : ""}`} assinadoEm={quando("prefeito")} />
          <Assinatura nome={a.secretario_nome} cargo={`Secretário(a) de Educação${a.secretario_cpf ? ` — CPF ${mascaraCpf(a.secretario_cpf)}` : ""}`} assinadoEm={quando("secretario")} />
          <Assinatura
            nome={assinaturas?.find((x) => x.papel === "sindicato")?.nome}
            cargo={`Presidente do Sindicato Rural${assinaturas?.find((x) => x.papel === "sindicato")?.cpf ? ` — CPF ${mascaraCpf(assinaturas!.find((x) => x.papel === "sindicato")!.cpf!)}` : ""}`}
            assinadoEm={quando("sindicato")}
          />
          <Assinatura nome={c?.nome} cargo={`Coordenador(a) do Projeto${c?.cpf ? ` — CPF ${mascaraCpf(c.cpf)}` : ""}`} assinadoEm={quando("coordenador")} />
        </div>

        <p className="mt-6 border-t border-[#D8D0B8] pt-2 text-[9.5px] text-[#6E6555]">
          Documento gerado pelo Painel do Projeto Valores Humanos em {new Date().toLocaleDateString("pt-BR")}.
          {assinaturas ? " Documento enviado para assinatura eletrônica por e-mail." : aprovada ? ` Adesão aprovada em ${aprovada}.` : a.status === "rascunho" ? " Adesão ainda não enviada para aprovação." : " Adesão ainda aguardando aprovação."}
          {a.responsavel_preenchimento ? ` Responsável pelo preenchimento: ${a.responsavel_preenchimento}.` : ""}
        </p>
      </div>
    </article>
  );
}

// Termo de Adesão para imprimir/salvar em PDF. Usado pelo administrador (com `id` da adesão)
// e pelo coordenador do município (sem `id`: abre a própria adesão do ciclo ativo).
export function TermoDocumento({ id, voltarHref }: { id?: string; voltarHref: string }) {
  const [a, setA] = useState<Adesao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiGet(id ? `/api/adesao?id=${id}` : "/api/adesao")
      .then((r) => (r.adesao ? setA(r.adesao) : setErro("Nenhuma adesão encontrada. Preencha e envie a ficha primeiro.")))
      .catch((e) => setErro(e.message));
  }, [id]);

  if (erro) return <div className="p-8 text-sm text-status-pendente">{erro}</div>;
  if (!a) return <div className="p-8 text-sm text-brand-dark/75">Carregando termo...</div>;

  return (
    <div className="min-h-screen bg-[#EDEAE0] py-4 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 16mm 14mm; } @media print { html, body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>

      {/* barra de ações (não sai na impressão) */}
      <div className="mx-auto mb-3 flex w-full max-w-[210mm] items-center justify-between gap-2 px-3 print:hidden">
        <Link href={voltarHref} className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-brand-dark hover:bg-black/5">← Voltar</Link>
        <button type="button" onClick={() => window.print()} className="rounded-lg bg-brand-light px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-accent">
          Salvar em PDF / imprimir
        </button>
      </div>

      {a.status === "rascunho" && (
        <div className="mx-auto mb-3 w-full max-w-[210mm] px-3 print:hidden">
          <div className="rounded-lg bg-[#FFF3CC] px-4 py-2.5 text-sm font-semibold text-[#6E4B00]">
            Termo para conferência. Para colher as assinaturas, use "Enviar para assinatura por e-mail" na ficha (etapa 5) ou salve em PDF, assine digitalmente (prefeito, secretário de educação, presidente do sindicato e coordenador) e anexe o PDF assinado antes de enviar a adesão.
          </div>
        </div>
      )}

      <TermoConteudo a={a} />
    </div>
  );
}
