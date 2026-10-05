"use client";

import { TituloPagina, Indicador } from "@/components/TituloPagina";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiAbrirArquivo, apiGet, apiPost, apiPostForm, limparCacheApi } from "@/lib/api";
import { usePerfil } from "@/lib/usePerfil";
import { FileTextIcon } from "@/components/icons";
import { estaCompleta, FormularioEscola } from "@/components/FormularioEscola";
import { AssinaturaEmail } from "@/components/AssinaturaEmail";
import type { Escola } from "@/lib/api";
import { mascaraCep, mascaraCpf, mascaraTelefone } from "@/lib/mascaras";

const CAMPO =
  "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 disabled:bg-black/[0.03] disabled:text-brand-dark/70";
const ROTULO = "block text-sm font-medium text-brand-dark mb-1.5";

type MunicipioOpcao = { id: number; nome: string; ocupado?: boolean };
type EscolaLista = { id: string; nome: string; tipo?: string | null; endereco?: string | null; latitude?: number | null; longitude?: number | null };
type Sel = { professores: string; i3: string; i4: string; i5: string };

type Dados = {
  prefeito_nome: string; prefeito_rg: string; prefeito_cpf: string; prefeitura_endereco: string;
  prefeitura_cep: string; prefeitura_telefone: string; prefeitura_email: string;
  secretario_nome: string; secretario_cpf: string; secretaria_endereco: string;
  secretaria_telefone: string; secretaria_email: string; responsavel_preenchimento: string;
};
const VAZIO: Dados = {
  prefeito_nome: "", prefeito_rg: "", prefeito_cpf: "", prefeitura_endereco: "", prefeitura_cep: "",
  prefeitura_telefone: "", prefeitura_email: "", secretario_nome: "", secretario_cpf: "",
  secretaria_endereco: "", secretaria_telefone: "", secretaria_email: "", responsavel_preenchimento: "",
};

type TermoAssinado = { nome?: string | null; em?: string | null; atualizado: boolean };

type AdesaoApi = {
  termo_assinado?: TermoAssinado | null;
  id: string; status: "rascunho" | "enviada" | "aprovada"; municipio_id: number | null; observacao_admin?: string | null;
  enviada_em?: string | null; escolas: { escola_id: string; quantidade_professores: number; matricula_infantil_3: number; matricula_infantil_4: number; matricula_infantil_5: number }[];
} & Partial<Record<keyof Dados, string | null>>;

type Resposta = {
  ciclo: { id: string; nome: string } | null;
  coordenador: { nome?: string; cpf?: string; rg?: string; telefone1?: string; telefone2?: string; email?: string } | null;
  municipio_fixo?: number | null;
  adesao: AdesaoApi | null;
};

const ABAS = ["Município e prefeitura", "Secretaria de Educação", "Coordenador(a)", "Escolas", "Termo assinado"];

export default function AdesaoPage() {
  const { perfil, carregando: carregandoPerfil } = usePerfil();
  const [resp, setResp] = useState<Resposta | null>(null);
  const [municipios, setMunicipios] = useState<MunicipioOpcao[]>([]);
  const [municipioId, setMunicipioId] = useState("");
  const [dados, setDados] = useState<Dados>(VAZIO);
  const [escolas, setEscolas] = useState<EscolaLista[]>([]);
  const [carregandoEscolas, setCarregandoEscolas] = useState(false);
  const [sel, setSel] = useState<Record<string, Sel>>({});
  const [busca, setBusca] = useState("");
  const [editandoEscolaId, setEditandoEscolaId] = useState<string | null>(null); // escola com o formulário de dados aberto
  const [aba, setAba] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [status, setStatus] = useState<"rascunho" | "enviada" | "aprovada">("rascunho");
  const [observacao, setObservacao] = useState<string | null>(null);
  const [termo, setTermo] = useState<TermoAssinado | null>(null); // PDF do termo assinado digitalmente
  const [declaracao, setDeclaracao] = useState(false); // ciência da cláusula de veracidade e uso dos dados
  const [editando, setEditando] = useState(false); // enviada/aprovada abre em modo consulta; "Corrigir" volta ao formulário

  // preenche a tela com o que está salvo no servidor
  function preencherDe(a: AdesaoApi) {
    setStatus(a.status);
    setTermo(a.termo_assinado ?? null);
    setObservacao(a.observacao_admin ?? null);
    const d = { ...VAZIO };
    (Object.keys(VAZIO) as (keyof Dados)[]).forEach((k) => { d[k] = (a[k] as string | null) ?? ""; });
    setDados(d);
    const s: Record<string, Sel> = {};
    a.escolas.forEach((e) => {
      s[e.escola_id] = {
        professores: String(e.quantidade_professores ?? 0), i3: String(e.matricula_infantil_3 ?? 0),
        i4: String(e.matricula_infantil_4 ?? 0), i5: String(e.matricula_infantil_5 ?? 0),
      };
    });
    setSel(s);
  }

  // carrega a adesão (se já existir). Quando o município já é conhecido (cadastro do coordenador), as escolas
  // são pedidas ao mesmo tempo, sem esperar a adesão chegar, e a lista com todos os municípios nem é baixada.
  useEffect(() => {
    if (carregandoPerfil || perfil?.role !== "municipio") return;
    const municipioConhecido = Boolean(perfil.municipio_nome);
    if (municipioConhecido) {
      setCarregandoEscolas(true);
      apiGet("/api/adesao/escolas")
        .then(setEscolas)
        .catch((e) => setErro(e.message))
        .finally(() => setCarregandoEscolas(false));
    }
    apiGet("/api/adesao")
      .then((r: Resposta) => {
        setResp(r);
        const a = r.adesao;
        const fixo = r.municipio_fixo ? String(r.municipio_fixo) : "";
        setMunicipioId(a?.municipio_id ? String(a.municipio_id) : fixo);
        if (fixo) {
          setMunicipios([{ id: Number(fixo), nome: perfil.municipio_nome ?? `Município ${fixo}` }]);
        } else {
          apiGet("/api/adesao/municipios").then(setMunicipios).catch((e) => setErro(e.message));
        }
        if (a) preencherDe(a);
        else setDados((d) => ({ ...d, responsavel_preenchimento: r.coordenador?.nome ?? "" }));
      })
      .catch((e) => setErro(e.message));
  }, [carregandoPerfil, perfil?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  // Enquanto a adesão aguarda aprovação, confere a resposta do administrador sozinho (a cada 20 s e
  // ao voltar para a aba): devolvida -> volta ao formulário com o recado; aprovada -> recarrega a página.
  useEffect(() => {
    if (status !== "enviada" || editando) return;
    async function verificar() {
      if (document.hidden) return;
      try {
        const r: Resposta = await apiGet("/api/adesao");
        const a = r.adesao;
        if (!a || a.status === "enviada") return;
        if (a.status === "aprovada") {
          limparCacheApi(); // o perfil muda (município liberado): atualiza menu e telas
          window.location.reload();
          return;
        }
        preencherDe(a);
        setMensagem(null);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        // sem conexão agora: tenta de novo no próximo ciclo
      }
    }
    const intervalo = window.setInterval(verificar, 20000);
    window.addEventListener("focus", verificar);
    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener("focus", verificar);
    };
  }, [status, editando]); // eslint-disable-line react-hooks/exhaustive-deps

  // escolas do município escolhido
  useEffect(() => {
    if (perfil?.municipio_nome) return; // município fixo: as escolas já foram pedidas no carregamento da ficha
    if (!municipioId) { setEscolas([]); return; }
    setCarregandoEscolas(true);
    apiGet(`/api/adesao/escolas?municipio_id=${municipioId}`)
      .then(setEscolas)
      .catch((e) => setErro(e.message))
      .finally(() => setCarregandoEscolas(false));
  }, [municipioId]);

  const somenteLeitura = status === "aprovada";

  function trocarMunicipio(id: string) {
    if (id !== municipioId && Object.keys(sel).length > 0) {
      if (!confirm("Trocar o município limpa as escolas já marcadas. Continuar?")) return;
      setSel({});
    }
    setMunicipioId(id);
  }

  function alternarEscola(id: string) {
    setSel((atual) => {
      const novo = { ...atual };
      if (novo[id]) delete novo[id];
      else novo[id] = { professores: "", i3: "", i4: "", i5: "" };
      return novo;
    });
  }

  function mudarNumero(id: string, chave: keyof Sel, valor: string) {
    setSel((atual) => ({ ...atual, [id]: { ...atual[id], [chave]: valor.replace(/\D/g, "").slice(0, 6) } }));
  }

  const marcadas = useMemo(() => escolas.filter((e) => sel[e.id]), [escolas, sel]);
  const totais = useMemo(() => {
    const ids = Object.keys(sel);
    const soma = (k: keyof Sel) => ids.reduce((t, id) => t + (parseInt(sel[id][k], 10) || 0), 0);
    return { escolas: ids.length, professores: soma("professores"), i3: soma("i3"), i4: soma("i4"), i5: soma("i5") };
  }, [sel]);

  const visiveis = useMemo(() => {
    const t = busca.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    if (!t) return escolas;
    return escolas.filter((e) => e.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(t));
  }, [escolas, busca]);

  function campo(chave: keyof Dados, valor: string) {
    setDados((d) => ({ ...d, [chave]: valor }));
  }

  async function salvar(acao: "rascunho" | "enviar") {
    setErro(null);
    setMensagem(null);
    if (acao === "enviar" && !declaracao) {
      setErro("Marque a declaração de veracidade (na aba Termo assinado) para enviar a adesão.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (acao === "enviar" && !confirm("Enviar a adesão, com o termo assinado, para aprovação do administrador?")) return;
    setSalvando(true);
    try {
      const r = await apiPost("/api/adesao", {
        acao,
        municipio_id: municipioId ? Number(municipioId) : null,
        ...dados,
        declaracao_aceita: acao === "enviar" ? declaracao : undefined,
        escolas: Object.entries(sel).map(([escola_id, v]) => ({
          escola_id, professores: v.professores, infantil3: v.i3, infantil4: v.i4, infantil5: v.i5,
        })),
      });
      setStatus(r.status);
      setTermo(r.termo_assinado ?? null);
      setEditando(false);
      if (acao === "enviar") setObservacao(null); // o recado fica visível até a adesão ser reenviada
      setMensagem(acao === "enviar" ? "Adesão enviada! Agora é só aguardar a aprovação do administrador." : "Rascunho salvo. Você pode continuar depois.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      setErro(e.message);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSalvando(false);
    }
  }

  // O termo é montado a partir da adesão salva: salva o rascunho e abre o termo em outra aba,
  // para imprimir/salvar em PDF e colher as assinaturas ANTES de enviar para aprovação.
  async function visualizarTermo(modo: "email" | "manual" = "manual"): Promise<boolean> {
    setErro(null);
    setMensagem(null);
    const janela = window.open("", "_blank"); // abre já, no clique, para o navegador não bloquear
    setSalvando(true);
    try {
      const r = await apiPost("/api/adesao", {
        acao: "rascunho",
        municipio_id: municipioId ? Number(municipioId) : null,
        ...dados,
        escolas: Object.entries(sel).map(([escola_id, v]) => ({
          escola_id, professores: v.professores, infantil3: v.i3, infantil4: v.i4, infantil5: v.i5,
        })),
      });
      setStatus(r.status);
      setTermo(r.termo_assinado ?? null);
      setMensagem(modo === "email"
        ? "Rascunho salvo. Confira o termo na outra aba e volte aqui para enviá-lo para assinatura por e-mail."
        : "Rascunho salvo. Na outra aba, salve o termo em PDF e colha as assinaturas digitais; depois anexe o PDF assinado aqui, na etapa 5.");
      if (janela) janela.location.href = "/adesao/termo";
      else window.location.href = "/adesao/termo";
      return true;
    } catch (e: any) {
      janela?.close();
      setErro(e.message);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return false;
    } finally {
      setSalvando(false);
    }
  }

  // Salva a ficha (o termo é montado a partir dela) e anexa o PDF assinado
  async function anexarTermo(arquivo: File | null) {
    if (!arquivo) return;
    setErro(null);
    setMensagem(null);
    if (arquivo.type !== "application/pdf" && !arquivo.name.toLowerCase().endsWith(".pdf")) return setErro("Envie o termo em PDF.");
    if (arquivo.size > 4 * 1024 * 1024) return setErro("O arquivo passa de 4 MB. Gere o PDF assinado de novo, em tamanho menor.");
    setSalvando(true);
    try {
      await apiPost("/api/adesao", {
        acao: "rascunho",
        municipio_id: municipioId ? Number(municipioId) : null,
        ...dados,
        escolas: Object.entries(sel).map(([escola_id, v]) => ({
          escola_id, professores: v.professores, infantil3: v.i3, infantil4: v.i4, infantil5: v.i5,
        })),
      });
      const form = new FormData();
      form.append("file", arquivo);
      const r = await apiPostForm("/api/adesao/termo-assinado", form);
      setStatus("rascunho");
      setTermo(r.termo_assinado);
      setMensagem("Termo assinado anexado. Agora é só clicar em \"Enviar adesão\".");
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  // Salva a ficha como rascunho sem mensagens (o termo enviado para assinatura é montado a partir dela)
  async function salvarRascunhoParaAssinatura() {
    const r = await apiPost("/api/adesao", {
      acao: "rascunho",
      municipio_id: municipioId ? Number(municipioId) : null,
      ...dados,
      escolas: Object.entries(sel).map(([escola_id, v]) => ({
        escola_id, professores: v.professores, infantil3: v.i3, infantil4: v.i4, infantil5: v.i5,
      })),
    });
    setStatus(r.status);
    setTermo(r.termo_assinado ?? null);
  }

  // As 3 pessoas assinaram por e-mail: o PDF já foi guardado, é só buscar o estado atualizado
  async function aoConcluirAssinaturaEmail() {
    try {
      const r: Resposta = await apiGet("/api/adesao");
      setTermo(r.adesao?.termo_assinado ?? null);
      setMensagem("Todas as assinaturas foram concluídas. Agora é só confirmar a declaração e clicar em \"Enviar adesão\".");
    } catch (e: any) {
      setErro(e.message);
    }
  }

  async function verTermoAssinado() {
    setErro(null);
    try {
      await apiAbrirArquivo("/api/adesao/termo-assinado");
    } catch (e: any) {
      setErro(e.message);
    }
  }

  if (carregandoPerfil) return null;
  if (perfil?.role !== "municipio") {
    return (
      <div className="p-4 sm:p-8 max-w-3xl">
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-6 text-sm text-brand-dark/80">
          A ficha de adesão é preenchida pelo(a) coordenador(a) do município.{" "}
          {perfil?.role === "admin" && <Link href="/admin/termo-adesao" className="font-semibold text-brand-light underline">Ver as adesões recebidas (Termo de Adesão)</Link>}
        </div>
      </div>
    );
  }
  if (!resp && !erro) return <div className="p-8 text-sm text-brand-dark/75">Carregando...</div>;

  const c = resp?.coordenador;
  const faixa =
    status === "aprovada"
      ? { cor: "#17613B", fundo: "#E3F4EA", texto: "Adesão aprovada. O seu município já está liberado no programa." }
      : status === "enviada"
        ? { cor: "#0F4C85", fundo: "#E2EFFB", texto: "Adesão enviada — aguardando a aprovação do administrador. Você ainda pode corrigir e reenviar." }
        : observacao
          ? { cor: "#8A2A00", fundo: "#FFE8D9", texto: "Adesão devolvida para correção — veja o recado do administrador abaixo." }
          : { cor: "#6E4B00", fundo: "#FFF3CC", texto: "Rascunho — a adesão ainda não foi enviada." };

  // Depois de enviada, a ficha vira consulta: só as escolas escolhidas e o acesso ao termo (PDF)
  if ((status === "enviada" || status === "aprovada") && !editando) {
    return (
      <div className="p-4 sm:p-8 max-w-5xl">
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 sm:p-7">
          <TituloPagina
            descricao="Acompanhe a situação da adesão e consulte o termo assinado."
            acao={<Indicador valor={totais.escolas} rotulo={totais.escolas === 1 ? "escola participante" : "escolas participantes"} />}
          >Ficha de adesão — Projeto Valores</TituloPagina>

          <div className="mt-5 rounded-lg px-4 py-3 text-sm font-semibold" style={{ background: faixa.fundo, color: faixa.cor }}>
            {resp?.ciclo && <span className="mr-2 rounded-full bg-white/70 px-2 py-0.5 text-xs">Ano de referência: {resp.ciclo.nome}</span>}
            {status === "enviada" ? "Adesão enviada — aguardando a aprovação do administrador." : faixa.texto}
          </div>
          {erro && <div className="mt-3 rounded-lg bg-status-pendente/10 text-status-pendente px-4 py-3 text-sm" role="alert">{erro}</div>}
          {mensagem && <div className="mt-3 rounded-lg bg-status-completo/10 text-status-completo px-4 py-3 text-sm">{mensagem}</div>}

          <div className="mt-5 rounded-xl border border-black/5 bg-black/[0.02] p-4">
            <h2 className="text-lg font-bold text-brand-dark">Termo de Adesão assinado</h2>
            <p className="mt-0.5 text-sm text-brand-dark/75">
              {termo ? `Anexado${termo.em ? ` em ${new Date(termo.em).toLocaleDateString("pt-BR")}` : ""}.` : "Nenhum arquivo anexado."}
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              {termo && (
                <button type="button" onClick={verTermoAssinado}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-light px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-accent">
                  <FileTextIcon className="h-4 w-4" /> Ver termo assinado
                </button>
              )}
              {status === "enviada" && (
                <button type="button" onClick={() => setEditando(true)}
                  className="rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-black/5">
                  Corrigir e reenviar
                </button>
              )}
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-black/5 bg-[#E3F4EA] px-4 py-3 text-sm text-[#17613B]">
            <strong>{totais.escolas}</strong> escola(s) · <strong>{totais.professores}</strong> professor(es) ·
            Infantil 3: <strong>{totais.i3}</strong> · Infantil 4: <strong>{totais.i4}</strong> · Infantil 5: <strong>{totais.i5}</strong> alunos
          </div>

          <h2 className="mt-6 text-lg font-bold text-brand-dark">Escolas participantes</h2>
          {carregandoEscolas ? (
            <p className="mt-2 text-sm text-brand-dark/75">Carregando escolas...</p>
          ) : (
            <div className="mt-2 overflow-x-auto rounded-xl border border-black/5">
              <table className="w-full text-sm">
                <thead className="bg-black/[0.03] text-left text-xs text-brand-dark/70">
                  <tr><th className="px-3 py-2">Escola</th><th className="px-3 py-2">Prof.</th><th className="px-3 py-2">Inf. 3</th><th className="px-3 py-2">Inf. 4</th><th className="px-3 py-2">Inf. 5</th></tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {marcadas.map((e) => (
                    <tr key={e.id}>
                      <td className="px-3 py-2">
                        <span className="block font-medium text-brand-dark">{e.nome}</span>
                        {(e.tipo || e.endereco) && <span className="block text-xs text-brand-dark/70">{[e.tipo, e.endereco].filter(Boolean).join(" · ")}</span>}
                      </td>
                      <td className="px-3 py-2">{sel[e.id].professores || 0}</td>
                      <td className="px-3 py-2">{sel[e.id].i3 || 0}</td>
                      <td className="px-3 py-2">{sel[e.id].i4 || 0}</td>
                      <td className="px-3 py-2">{sel[e.id].i5 || 0}</td>
                    </tr>
                  ))}
                  {marcadas.length === 0 && <tr><td colSpan={5} className="px-3 py-3 text-brand-dark/75">Nenhuma escola nesta adesão.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 sm:p-7">
        <TituloPagina
          descricao="Escolha o município, informe os dados da prefeitura e da secretaria e marque as escolas que vão participar."
          acao={<Indicador valor={totais.escolas} rotulo={totais.escolas === 1 ? "escola marcada" : "escolas marcadas"} />}
        >Ficha de adesão — Projeto Valores</TituloPagina>

        {resp && !resp.ciclo && (
          <div className="mt-5 rounded-lg bg-[#FFF3CC] text-[#6E4B00] px-4 py-3 text-sm">Não há um ciclo ativo no momento. Fale com o administrador.</div>
        )}

        <div className="mt-5 rounded-lg px-4 py-3 text-sm font-semibold" style={{ background: faixa.fundo, color: faixa.cor }}>
          {resp?.ciclo && <span className="mr-2 rounded-full bg-white/70 px-2 py-0.5 text-xs">Ano de referência: {resp.ciclo.nome}</span>}
          {faixa.texto}
        </div>
        <ol className="mt-3 grid gap-2 rounded-lg bg-black/[0.03] px-4 py-3 text-sm text-brand-dark sm:grid-cols-4">
          <li><strong>1.</strong> Preencha as etapas 1 a 4.</li>
          <li><strong>2.</strong> Na etapa 5, abra o termo e confira os dados.</li>
          <li><strong>3.</strong> Envie o termo para assinatura por e-mail e aguarde as 3 assinaturas.</li>
          <li><strong>4.</strong> Clique em <em>Enviar adesão</em>.</li>
        </ol>
        {observacao && (
          <div className="mt-3 rounded-lg border border-[#F2B48C] bg-[#FFF4EC] px-4 py-3 text-sm text-[#5A2200]">
            <p className="font-bold">O administrador pediu correções na sua adesão:</p>
            <p className="mt-1 whitespace-pre-line">{observacao}</p>
            <p className="mt-2 text-xs text-[#5A2200]/80">Ajuste o que foi pedido e envie de novo. Se mudar dados ou escolas, o termo precisa ser assinado e anexado outra vez (etapa 5).</p>
          </div>
        )}
        {erro && <div className="mt-3 rounded-lg bg-status-pendente/10 text-status-pendente px-4 py-3 text-sm" role="alert">{erro}</div>}
        {mensagem && <div className="mt-3 rounded-lg bg-status-completo/10 text-status-completo px-4 py-3 text-sm">{mensagem}</div>}

        {/* abas */}
        <div className="mt-6 flex flex-nowrap gap-1.5 overflow-x-auto pb-1" role="tablist">
          {ABAS.map((nome, i) => (
            <button key={nome} type="button" role="tab" aria-selected={aba === i} onClick={() => setAba(i)}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${aba === i ? "bg-brand-light text-white" : "bg-black/5 text-brand-dark hover:bg-black/10"}`}>
              <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/80 text-xs text-brand-dark">{i + 1}</span>
              {nome}
            </button>
          ))}
        </div>

        <fieldset disabled={somenteLeitura} className="mt-5">
          {aba === 0 && (
            <div className="space-y-4">
              <div>
                <label className={ROTULO}>Município</label>
                <select value={municipioId} onChange={(e) => trocarMunicipio(e.target.value)} disabled={somenteLeitura || Boolean(resp?.municipio_fixo)} className={CAMPO}>
                  <option value="">Selecione o município...</option>
                  {municipios.map((m) => (
                    <option key={m.id} value={m.id} disabled={m.ocupado}>{m.nome}{m.ocupado ? " (já possui adesão)" : ""}</option>
                  ))}
                </select>
                {resp?.municipio_fixo ? <p className="mt-1 text-xs text-brand-dark/70">Município escolhido no seu cadastro. Para trocar, fale com o administrador.</p> : null}
              </div>
              <div><label className={ROTULO}>Prefeito(a)</label><input className={CAMPO} value={dados.prefeito_nome} onChange={(e) => campo("prefeito_nome", e.target.value)} /></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className={ROTULO}>CPF do prefeito(a)</label><input className={CAMPO} placeholder="000.000.000-00" inputMode="numeric" value={dados.prefeito_cpf} onChange={(e) => campo("prefeito_cpf", mascaraCpf(e.target.value))} /></div>
                <div><label className={ROTULO}>RG do prefeito(a)</label><input className={CAMPO} value={dados.prefeito_rg} onChange={(e) => campo("prefeito_rg", e.target.value)} /></div>
              </div>
              <div><label className={ROTULO}>Endereço da prefeitura</label><input className={CAMPO} value={dados.prefeitura_endereco} onChange={(e) => campo("prefeitura_endereco", e.target.value)} /></div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div><label className={ROTULO}>CEP</label><input className={CAMPO} placeholder="00000-000" inputMode="numeric" value={dados.prefeitura_cep} onChange={(e) => campo("prefeitura_cep", mascaraCep(e.target.value))} /></div>
                <div><label className={ROTULO}>Telefone</label><input className={CAMPO} placeholder="(00) 00000-0000" inputMode="tel" value={dados.prefeitura_telefone} onChange={(e) => campo("prefeitura_telefone", mascaraTelefone(e.target.value))} /></div>
                <div><label className={ROTULO}>E-mail</label><input type="email" className={CAMPO} value={dados.prefeitura_email} onChange={(e) => campo("prefeitura_email", e.target.value)} /></div>
              </div>
            </div>
          )}

          {aba === 1 && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className={ROTULO}>Secretário(a) de Educação</label><input className={CAMPO} value={dados.secretario_nome} onChange={(e) => campo("secretario_nome", e.target.value)} /></div>
                <div><label className={ROTULO}>CPF</label><input className={CAMPO} placeholder="000.000.000-00" inputMode="numeric" value={dados.secretario_cpf} onChange={(e) => campo("secretario_cpf", mascaraCpf(e.target.value))} /></div>
              </div>
              <div><label className={ROTULO}>Endereço da secretaria</label><input className={CAMPO} value={dados.secretaria_endereco} onChange={(e) => campo("secretaria_endereco", e.target.value)} /></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className={ROTULO}>Telefone</label><input className={CAMPO} placeholder="(00) 00000-0000" inputMode="tel" value={dados.secretaria_telefone} onChange={(e) => campo("secretaria_telefone", mascaraTelefone(e.target.value))} /></div>
                <div><label className={ROTULO}>E-mail</label><input type="email" className={CAMPO} value={dados.secretaria_email} onChange={(e) => campo("secretaria_email", e.target.value)} /></div>
              </div>
            </div>
          )}

          {aba === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-brand-dark/75">Estes dados vêm do seu cadastro. Para alterar, fale com o administrador.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className={ROTULO}>Nome</label><input className={CAMPO} disabled value={c?.nome ?? ""} readOnly /></div>
                <div><label className={ROTULO}>E-mail</label><input className={CAMPO} disabled value={c?.email ?? ""} readOnly /></div>
                <div><label className={ROTULO}>CPF</label><input className={CAMPO} disabled value={c?.cpf ? mascaraCpf(c.cpf) : ""} readOnly /></div>
                <div><label className={ROTULO}>RG</label><input className={CAMPO} disabled value={c?.rg ?? ""} readOnly /></div>
                <div><label className={ROTULO}>Telefone 1</label><input className={CAMPO} disabled value={c?.telefone1 ?? ""} readOnly /></div>
                <div><label className={ROTULO}>Telefone 2</label><input className={CAMPO} disabled value={c?.telefone2 ?? ""} readOnly /></div>
              </div>
              <div>
                <label className={ROTULO}>Responsável pelo preenchimento desta ficha</label>
                <input className={CAMPO} value={dados.responsavel_preenchimento} onChange={(e) => campo("responsavel_preenchimento", e.target.value)} />
              </div>
            </div>
          )}

          {aba === 3 && (
            <div className="space-y-5">
              {!municipioId ? (
                <div className="rounded-lg bg-[#FFF3CC] text-[#6E4B00] px-4 py-3 text-sm">
                  Escolha o município na aba 1 para ver as escolas.
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-black/5 bg-[#E3F4EA] px-4 py-3 text-sm text-[#17613B]">
                    <strong>{totais.escolas}</strong> escola(s) · <strong>{totais.professores}</strong> professor(es) ·
                    Infantil 3: <strong>{totais.i3}</strong> · Infantil 4: <strong>{totais.i4}</strong> · Infantil 5: <strong>{totais.i5}</strong> alunos
                  </div>

                  {/* 1. escolher: lista enxuta, só marcar */}
                  <section>
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <h3 className="text-base font-bold text-brand-dark">1. Marque as escolas que vão participar</h3>
                      {!carregandoEscolas && escolas.length > 0 && <span className="text-xs text-brand-dark/70">{escolas.length} escolas no município</span>}
                    </div>
                    <input className={`${CAMPO} mt-2`} placeholder="Buscar escola pelo nome..." value={busca} onChange={(e) => setBusca(e.target.value)} />
                    {carregandoEscolas ? (
                      <p className="mt-3 text-sm text-brand-dark/75">Carregando escolas...</p>
                    ) : escolas.length === 0 ? (
                      <p className="mt-3 text-sm text-brand-dark/75">Nenhuma escola cadastrada para este município. Fale com o administrador.</p>
                    ) : (
                      <ul className="mt-2 max-h-72 divide-y divide-black/5 overflow-y-auto rounded-xl border border-black/10 bg-white">
                        {visiveis.map((e) => (
                          <li key={e.id}>
                            <label className={`flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-black/[0.02] ${sel[e.id] ? "bg-[#F3FAF6]" : ""}`}>
                              <input type="checkbox" className="h-4 w-4 shrink-0" checked={Boolean(sel[e.id])} onChange={() => { alternarEscola(e.id); if (editandoEscolaId === e.id) setEditandoEscolaId(null); }} />
                              <span className="min-w-0 flex-1 truncate text-sm font-medium text-brand-dark">{e.nome}</span>
                              {e.tipo && <span className="shrink-0 text-xs text-brand-dark/60">{e.tipo}</span>}
                            </label>
                          </li>
                        ))}
                        {visiveis.length === 0 && <li className="px-3 py-3 text-sm text-brand-dark/75">Nenhuma escola com esse nome.</li>}
                      </ul>
                    )}
                  </section>

                  {/* 2. relação das escolhidas, com os números */}
                  <section>
                    <h3 className="text-base font-bold text-brand-dark">2. Informe os dados das escolas escolhidas ({marcadas.length})</h3>
                    {marcadas.length === 0 ? (
                      <div className="mt-2 rounded-xl border border-dashed border-black/10 p-6 text-center text-sm text-brand-dark/75">
                        Nenhuma escola escolhida ainda. Marque acima as que vão participar.
                      </div>
                    ) : (
                      <div className="mt-2 overflow-x-auto rounded-xl border border-black/10">
                        <table className="w-full min-w-[640px] text-sm">
                          <thead className="bg-black/[0.03] text-left text-xs text-brand-dark/70">
                            <tr>
                              <th className="px-3 py-2">Escola</th>
                              <th className="px-2 py-2">Professores</th>
                              <th className="px-2 py-2">Infantil 3</th>
                              <th className="px-2 py-2">Infantil 4</th>
                              <th className="px-2 py-2">Infantil 5</th>
                              <th className="px-2 py-2" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-black/5">
                            {marcadas.map((e) => {
                              const completa = estaCompleta({ ...e, municipio_id: Number(municipioId) } as Escola);
                              return (
                                <Fragment key={e.id}>
                                  <tr className="align-top">
                                    <td className="px-3 py-2">
                                      <span className="block font-semibold text-brand-dark">{e.nome}</span>
                                      <span className="block text-xs text-brand-dark/70">{[e.tipo, e.endereco].filter(Boolean).join(" · ") || "Sem endereço informado"}</span>
                                      {!completa && !somenteLeitura && (
                                        <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">Faltam endereço ou localização</span>
                                      )}
                                    </td>
                                    {([["professores", "Nº de professores"], ["i3", "Infantil 3 (alunos)"], ["i4", "Infantil 4 (alunos)"], ["i5", "Infantil 5 (alunos)"]] as [keyof Sel, string][]).map(([chave, rotulo]) => (
                                      <td key={chave} className="px-2 py-2">
                                        <input
                                          className={`${CAMPO} w-20 px-2 py-1.5`}
                                          inputMode="numeric"
                                          aria-label={`${rotulo} — ${e.nome}`}
                                          value={sel[e.id][chave]}
                                          onChange={(ev) => mudarNumero(e.id, chave, ev.target.value)}
                                        />
                                      </td>
                                    ))}
                                    <td className="whitespace-nowrap px-2 py-2 text-right">
                                      {!somenteLeitura && (
                                        <>
                                          <button type="button" onClick={() => setEditandoEscolaId(editandoEscolaId === e.id ? null : e.id)} className="mr-3 text-xs font-semibold text-brand-light hover:underline">
                                            {editandoEscolaId === e.id ? "Fechar" : "Editar dados"}
                                          </button>
                                          <button type="button" onClick={() => { alternarEscola(e.id); if (editandoEscolaId === e.id) setEditandoEscolaId(null); }} className="text-xs font-semibold text-status-pendente hover:underline">
                                            Remover
                                          </button>
                                        </>
                                      )}
                                    </td>
                                  </tr>
                                  {editandoEscolaId === e.id && (
                                    <tr key={`${e.id}-edicao`}>
                                      <td colSpan={6} className="bg-black/[0.02] px-4 pb-4">
                                        <FormularioEscola
                                          escola={{ ...e, municipio_id: Number(municipioId) } as Escola}
                                          endpoint="/api/adesao/escola"
                                          onCancelar={() => setEditandoEscolaId(null)}
                                          onSalvo={(nova) => {
                                            setEscolas((lista) => lista.map((x) => (x.id === nova.id ? { ...x, ...nova } : x)));
                                            setEditandoEscolaId(null);
                                            setMensagem(null);
                                          }}
                                        />
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          )}
          {aba === 4 && (
            <div className="space-y-4">
              <AssinaturaEmail
                prefeitoNome={dados.prefeito_nome}
                prefeitoEmail={dados.prefeitura_email}
                coordenadorNome={c?.nome ?? ""}
                coordenadorEmail={c?.email ?? ""}
                pronto={Boolean(resp?.ciclo && municipioId && totais.escolas > 0 && dados.prefeito_nome.trim())}
                motivoBloqueio="Para enviar, preencha o nome do(a) prefeito(a) (aba Município e prefeitura) e marque ao menos uma escola."
                somenteLeitura={somenteLeitura}
                salvarAntes={salvarRascunhoParaAssinatura}
                secretarioNome={dados.secretario_nome}
                secretarioEmail={dados.secretaria_email}
                abrirTermo={() => visualizarTermo("email")}
                abrindoTermo={salvando}
                declaracao={declaracao}
                onDeclaracao={setDeclaracao}
                onConcluido={aoConcluirAssinaturaEmail}
              />

              <details className="group rounded-xl border border-black/5 bg-black/[0.02] p-4" open={Boolean(termo) && !termo?.atualizado ? true : undefined}>
                <summary className="cursor-pointer text-sm font-semibold text-brand-dark/80">Prefiro assinar fora do sistema (gov.br, certificado digital) e anexar o PDF</summary>
                <div className="mt-3 space-y-4">
              <div className="rounded-xl border border-black/5 bg-black/[0.02] p-4">
                <h3 className="text-base font-bold text-brand-dark">1. Abra o termo e salve em PDF</h3>
                <p className="mt-0.5 text-sm text-brand-dark/75">O termo é montado com os dados que você preencheu. Confira e use <em>Salvar em PDF</em> na página que abrir.</p>
                <button type="button" disabled={salvando || !resp?.ciclo || !municipioId || totais.escolas === 0} onClick={() => visualizarTermo("manual")}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-light px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-accent disabled:opacity-50">
                  <FileTextIcon className="h-4 w-4" /> Abrir termo (PDF)
                </button>
                {totais.escolas === 0 && <p className="mt-2 text-xs text-brand-dark/70">Marque ao menos uma escola na etapa 4 para gerar o termo.</p>}
              </div>

              <div className="rounded-xl border border-black/5 bg-black/[0.02] p-4">
                <h3 className="text-base font-bold text-brand-dark">2. Colha as assinaturas digitais</h3>
                <p className="mt-0.5 text-sm text-brand-dark/75">
                  O <strong>mesmo PDF</strong> deve passar pelo(a) <strong>prefeito(a)</strong>, pelo(a) <strong>secretário(a) de educação</strong>, pelo(a) <strong>presidente do sindicato</strong> e pelo(a) <strong>coordenador(a)</strong>,
                  e cada um acrescenta a sua assinatura digital. No fim, você terá <strong>um único arquivo com as quatro assinaturas</strong>.
                </p>
              </div>

              <div className="rounded-xl border border-black/5 bg-black/[0.02] p-4">
                <h3 className="text-base font-bold text-brand-dark">3. Anexe o PDF final, com as quatro assinaturas</h3>
                {termo && (
                  <div className={`mt-2 rounded-lg px-3 py-2 text-sm ${termo.atualizado ? "bg-[#E3F4EA] text-[#17613B]" : "bg-amber-50 text-amber-900"}`}>
                    {termo.atualizado ? (
                      <>✅ Termo assinado anexado{termo.em ? ` em ${new Date(termo.em).toLocaleDateString("pt-BR")}` : ""}.</>
                    ) : (
                      <>⚠️ Você alterou dados ou escolas depois da assinatura, então as assinaturas anteriores não valem mais. Abra o termo de novo, colha as assinaturas e anexe o novo PDF.</>
                    )}
                    <button type="button" onClick={verTermoAssinado} className="ml-2 font-semibold underline">Ver arquivo</button>
                  </div>
                )}
                {!somenteLeitura && (
                  <label className="mt-3 block">
                    <span className="sr-only">Escolher o PDF assinado</span>
                    <input type="file" accept="application/pdf,.pdf" disabled={salvando}
                      onChange={(ev) => { anexarTermo(ev.target.files?.[0] ?? null); ev.target.value = ""; }}
                      className="block w-full text-sm text-brand-dark file:mr-3 file:rounded-lg file:border-0 file:bg-brand-light file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-accent disabled:opacity-50" />
                  </label>
                )}
                <p className="mt-2 text-xs text-brand-dark/70">Envie um único PDF, até 4 MB. {termo ? "Escolher outro arquivo substitui o anterior." : "Se as assinaturas estiverem em arquivos separados, una tudo em um só PDF antes de anexar."}</p>
              </div>

                  {!somenteLeitura && (
                  <div className="rounded-xl border border-black/5 bg-black/[0.02] p-4">
                    <h3 className="text-base font-bold text-brand-dark">4. Confirme a declaração (assinatura fora do sistema)</h3>
                    <label className="mt-2 flex items-start gap-2 text-sm text-brand-dark">
                      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={declaracao} onChange={(ev) => setDeclaracao(ev.target.checked)} />
                      <span>
                        Declaro que as informações acima são verdadeiras e estou ciente de que os dados informados serão utilizados para os fins do
                        Projeto Valores, nos termos da cláusula "Da veracidade e do uso dos dados" do Termo de Adesão.
                      </span>
                    </label>
                  </div>
                )}
                </div>
              </details>

            </div>
          )}
        </fieldset>

        <div className="mt-7 flex flex-col-reverse gap-2 border-t border-black/5 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            {aba > 0 && <button type="button" onClick={() => setAba(aba - 1)} className="rounded-lg border border-black/10 px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-black/5">← Voltar</button>}
            {aba < ABAS.length - 1 && <button type="button" onClick={() => setAba(aba + 1)} className="rounded-lg border border-black/10 px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-black/5">Próximo: {ABAS[aba + 1]} →</button>}
          </div>
          {!somenteLeitura && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" disabled={salvando || !resp?.ciclo} onClick={() => salvar("rascunho")}
                className="rounded-lg border border-brand-light px-4 py-2 text-sm font-semibold text-brand-light hover:bg-brand-light/5 disabled:opacity-50">
                Salvar rascunho
              </button>
              <button type="button" disabled={salvando || !resp?.ciclo || !termo?.atualizado || !declaracao} onClick={() => salvar("enviar")}
                title={!termo?.atualizado ? "Anexe o termo assinado (etapa 5) para enviar" : !declaracao ? "Marque a declaração de veracidade (na aba Termo assinado) para enviar" : undefined}
                className="rounded-lg bg-brand-light px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-accent disabled:opacity-50">
                {status === "enviada" ? "Reenviar adesão" : "Enviar adesão"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
