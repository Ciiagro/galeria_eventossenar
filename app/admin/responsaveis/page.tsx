"use client";

import { apiBlobUrl } from "@/lib/api";
import { TituloPagina, Indicador } from "@/components/TituloPagina";

import { useEffect, useMemo, useState } from "react";
import { apiAbrirArquivo, apiDelete, apiGet, apiPost, Municipio } from "@/lib/api";
import { UserIcon, MailIcon, LockIcon, MapPinIcon, XIcon, BuildingIcon } from "@/components/icons";
import { AdminGuard } from "@/components/AdminGuard";
import { normalizarTexto } from "@/components/DocumentoUI";
import { Abas, BarraFiltros, CampoBusca, CLASSE_SELECT } from "@/components/Filtros";
import { mascaraCpf, mascaraTelefone } from "@/lib/mascaras";
import { reduzirFoto } from "@/lib/reduzirFoto";
import { FotoCoordenador } from "@/components/FotoCoordenador";
import { ItemMenu, MenuAcoes, Ordem, Pilula, RodapeTabela, Th, ordenar } from "@/components/TabelaCoordenadores";

const CAMPO =
  "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30";

export default function ResponsaveisPageGuarded() {
  return (
    <AdminGuard>
      <ResponsaveisPage />
    </AdminGuard>
  );
}

type CadastroRecebido = {
  user_id: string; nome?: string | null; email?: string | null; cpf?: string | null;
  telefone1?: string | null; telefone2?: string | null; municipio_id?: number | null; municipio_nome?: string | null;
  cadastrado_em?: string | null; adesao_id?: string | null;
  adesao_status: "sem_ficha" | "rascunho" | "enviada" | "aprovada"; adesao_enviada_em?: string | null;
};
const SITUACAO: Record<CadastroRecebido["adesao_status"], { texto: string; cor: string; fundo: string }> = {
  sem_ficha: { texto: "Sem adesão", cor: "#4A453A", fundo: "#EFEDE4" },
  rascunho: { texto: "Preenchendo", cor: "#6E4B00", fundo: "#FFF3CC" },
  enviada: { texto: "Aguardando aprovação", cor: "#0F4C85", fundo: "#E2EFFB" },
  aprovada: { texto: "Aprovada", cor: "#17613B", fundo: "#E3F4EA" },
};
type Situacao = { ativo: boolean; compromisso_em: string | null; email?: string | null; cpf?: string | null; rg?: string | null; telefone1?: string | null; telefone2?: string | null; adesao_id?: string | null; adesao_status?: string | null };
// "Parado há N dias": só para quem ainda não enviou a adesão (sem ficha ou preenchendo)
const diasParado = (iso?: string | null, status?: string | null) => {
  if (status && status !== "rascunho" && status !== "sem_ficha") return "";
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d.getTime())) return "";
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
  return dias <= 0 ? "Parado desde hoje" : `Parado há ${dias} ${dias === 1 ? "dia" : "dias"}`;
};

const dataCurta = (iso?: string | null) => {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d.getTime()) ? d.toLocaleDateString("pt-BR") : "—";
};

function ResponsaveisPage() {
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [municipioId, setMunicipioId] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const porPagina = 10;
  const [filtroMunicipio, setFiltroMunicipio] = useState("");
  const [ordem, setOrdem] = useState<Ordem | undefined>(undefined);
  const [situacao, setSituacao] = useState<Record<string, Situacao>>({});
  // dados do coordenador (formulário do administrador)
  const [cpf, setCpf] = useState("");
  const [rg, setRg] = useState("");
  const [telefone1, setTelefone1] = useState("");
  const [telefone2, setTelefone2] = useState("");
  const [fotoNova, setFotoNova] = useState("");
  const [substituindo, setSubstituindo] = useState(false);
  const [detalheId, setDetalheId] = useState<number | null>(null);
  const [detalheCad, setDetalheCad] = useState<CadastroRecebido | null>(null);
  type Historico = { user_id: string; nome: string | null; email: string | null; cpf: string | null; telefone1: string | null; desde: string | null; ate: string | null; atual: boolean; ativo: boolean; compromisso_em: string | null };
  const [historico, setHistorico] = useState<Historico[] | null>(null);
  useEffect(() => {
    setHistorico(null);
    if (detalheId === null) return;
    let vivo = true;
    apiGet(`/api/admin/coordenadores-historico?municipio_id=${detalheId}`).then((r) => { if (vivo) setHistorico(Array.isArray(r) ? r : []); }).catch(() => { if (vivo) setHistorico([]); });
    return () => { vivo = false; };
  }, [detalheId]);
  // cadastros feitos pelos próprios coordenadores (em /adesao) que ainda não foram liberados
  const [cadastros, setCadastros] = useState<CadastroRecebido[] | null>(null);
  const [aba, setAba] = useState<"aguardando" | "liberados" | "desativados" | null>(null);
  type Desativado = { user_id: string; nome: string | null; email: string | null; cpf: string | null; telefone1: string | null; municipio_nome: string | null; ativo: boolean; substituido: boolean; desativado_em: string | null; created_at: string | null };
  const [desativados, setDesativados] = useState<Desativado[]>([]);
  useEffect(() => { apiGet("/api/admin/coordenadores-desativados").then((r) => setDesativados(Array.isArray(r) ? r : [])).catch(() => setDesativados([])); }, [situacao]);
  // municípios contemplados = com escolas no programa do ciclo ativo ("todos" se não for possível consultar)
  const [contemplados, setContemplados] = useState<Set<number> | "todos" | null>(null);

  useEffect(() => {
    apiGet("/api/admin/coordenadores-cadastros")
      .then((lista: CadastroRecebido[]) => {
        setCadastros(lista);
        setAba((atual) => atual ?? (lista.length > 0 ? "aguardando" : "liberados"));
      })
      .catch(() => { setCadastros([]); setAba((atual) => atual ?? "liberados"); });
    apiGet("/api/admin/coordenadores-situacao").then(setSituacao).catch(() => setSituacao({}));
    apiGet("/api/municipios")
      .then((lista: Municipio[]) => {
        setMunicipios(lista);
        setMunicipioId(String(lista[0]?.id ?? ""));
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
    apiGet("/api/escolas-participantes?resumo=1")
      .then((r) => {
        const ids = Object.entries((r.por_municipio ?? {}) as Record<string, number>)
          .filter(([, qtd]) => Number(qtd) > 0)
          .map(([id]) => Number(id));
        setContemplados(new Set(ids));
      })
      .catch(() => setContemplados("todos"));
  }, []);

  const municipioSelecionado = useMemo(
    () => municipios.find((municipio) => String(municipio.id) === municipioId),
    [municipios, municipioId]
  );
  const responsaveis = municipios.filter((municipio) => municipio.responsavel_nome || municipio.responsavel_email);
  // só os municípios contemplados; o que já tem responsável continua na lista para poder ser editado
  const opcoesMunicipio = useMemo(
    () =>
      contemplados instanceof Set
        ? municipios.filter((m) => contemplados.has(m.id) || m.responsavel_nome || m.responsavel_email)
        : municipios,
    [municipios, contemplados]
  );
  const sit = (id?: string | null) => (id ? situacao[id] : undefined);
  const filtrados = useMemo(() => {
    const termo = normalizarTexto(busca.trim());
    const lista = responsaveis.filter(
      (m) =>
        (!filtroMunicipio || String(m.id) === filtroMunicipio) &&
        (!termo || [m.responsavel_nome, m.responsavel_email, m.nome, sit(m.responsavel_id)?.cpf, sit(m.responsavel_id)?.telefone1]
          .some((v) => normalizarTexto(v ?? "").includes(termo)))
    );
    return ordenar(lista, ordem, (m, col) => {
      const x = sit(m.responsavel_id);
      return col === "nome" ? m.responsavel_nome ?? "" : col === "email" ? m.responsavel_email ?? "" : col === "municipio" ? m.nome
        : col === "cpf" ? x?.cpf ?? "" : col === "situacao" ? (x?.ativo === false ? "Desativado" : "Ativo") : col === "compromisso" ? x?.compromisso_em ?? "" : "";
    });
  }, [responsaveis, busca, filtroMunicipio, ordem, situacao]); // eslint-disable-line react-hooks/exhaustive-deps

  const cadastrosFiltrados = useMemo(() => {
    const termo = normalizarTexto(busca.trim());
    const lista = (cadastros ?? []).filter(
      (c) =>
        (!filtroMunicipio || String(c.municipio_id) === filtroMunicipio) &&
        (!termo || [c.nome, c.email, c.municipio_nome, c.cpf].some((v) => normalizarTexto(v ?? "").includes(termo)))
    );
    return ordenar(lista, ordem, (c, col) =>
      col === "nome" ? c.nome ?? "" : col === "email" ? c.email ?? "" : col === "municipio" ? c.municipio_nome ?? ""
        : col === "telefone" ? c.telefone1 ?? "" : col === "adesao" ? SITUACAO[c.adesao_status].texto : col === "cadastro" ? c.cadastrado_em ?? "" : "");
  }, [cadastros, busca, filtroMunicipio, ordem]);

  // municípios para o filtro (os que aparecem na aba aberta)
  const opcoesFiltro = useMemo(() => {
    const mapa = new Map<string, string>();
    if (aba === "aguardando") (cadastros ?? []).forEach((c) => c.municipio_id && mapa.set(String(c.municipio_id), c.municipio_nome ?? `Município ${c.municipio_id}`));
    else responsaveis.forEach((m) => mapa.set(String(m.id), m.nome));
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt"));
  }, [aba, cadastros, responsaveis]);

  useEffect(() => { setPagina(1); setOrdem(undefined); }, [aba]);
  useEffect(() => { setPagina(1); }, [busca, filtroMunicipio]);

  function novoResponsavel() {
    setSubstituindo(false);
    setMunicipioId("");
    setNome("");
    setEmail("");
    setSenha("");
    setCpf(""); setRg(""); setTelefone1(""); setTelefone2(""); setFotoNova("");
    setMensagem(null);
    setErro(null);
    setMostrarFormulario(true);
  }

  async function alternarAtivo(id: string, nomeCoord: string, ativar: boolean) {
    const texto = ativar
      ? `Ativar de novo o acesso de ${nomeCoord}?`
      : `Desativar o acesso de ${nomeCoord}?\n\nO cadastro, o termo e os documentos dele ficam guardados. Se o coordenador mudou, depois clique em "+ Inserir responsável" e cadastre o novo coordenador deste município: ele receberá o termo de compromisso para assinar.`;
    if (!window.confirm(texto)) return;
    setErro(null);
    try {
      await apiPost("/api/admin/coordenadores/ativo", { user_id: id, ativo: ativar });
      setSituacao((atual) => ({ ...atual, [id]: { ...(atual[id] ?? { compromisso_em: null }), ativo: ativar } }));
      setMensagem(ativar ? "Acesso ativado." : "Acesso desativado. Para trocar de coordenador, clique em \"+ Inserir responsável\" e cadastre o novo.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível alterar o acesso.");
    }
  }

  async function desativarCadastro(id: string, nomeCoord: string) {
    if (!window.confirm(`Desativar o cadastro de ${nomeCoord}?\n\nA pessoa perde o acesso e sai desta lista. Nada é apagado: ela fica na aba "Desativados" e você pode reativar depois.`)) return;
    setErro(null);
    try {
      await apiPost("/api/admin/coordenadores/ativo", { user_id: id, ativo: false });
      setCadastros((atual) => (atual ?? []).filter((c) => c.user_id !== id));
      setSituacao((atual) => ({ ...atual, [id]: { ...(atual[id] ?? { compromisso_em: null }), ativo: false } }));
      setMensagem("Cadastro desativado. Ele está na aba \"Desativados\".");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível desativar o cadastro.");
    }
  }

  async function enviarTermo(id: string, nomeCoord: string) {
    if (!window.confirm(`Enviar o termo de compromisso por e-mail para ${nomeCoord}?\n\nEla(e) recebe um e-mail com o link para entrar, pedir o código e assinar.`)) return;
    setErro(null);
    try {
      const r = await apiPost("/api/admin/compromisso/enviar", { user_id: id });
      setMensagem(`E-mail enviado para ${r?.email ?? "o coordenador"}. Ao assinar, o acesso é liberado.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível enviar o e-mail.");
    }
  }

  type DadosSindicato = Record<string, string | null> & { nome: string };
  const [sindicatoVista, setSindicatoVista] = useState<DadosSindicato | null>(null);
  const [emailSel, setEmailSel] = useState("");
  const [cpfSel, setCpfSel] = useState("");
  const [sindSalvo, setSindSalvo] = useState(false);
  async function salvarDadosSindicato(email: string) {
    if (!sindicatoVista) return;
    setErro(null);
    setSindSalvo(false);
    try {
      await apiPost("/api/admin/municipio-sindicato", { municipio_id: Number(sindicatoVista.id), email, cpf: cpfSel });
      setSindicatoVista({ ...sindicatoVista, email_termo: email.toLowerCase(), cpf_termo: cpfSel.replace(/\D/g, "") });
      setSindSalvo(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  }
  async function verSindicato(municipioId: number) {
    setErro(null);
    try {
      const d = await apiGet(`/api/admin/municipio-sindicato?municipio_id=${municipioId}`);
      setEmailSel(d.email_termo ?? "");
      setCpfSel(d.cpf_termo ? mascaraCpf(d.cpf_termo) : "");
      setSindSalvo(false);
      setSindicatoVista({ ...d, id: String(municipioId) });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir os dados do sindicato.");
    }
  }

  async function verCompromisso(id: string) {
    setErro(null);
    try {
      await apiAbrirArquivo(`/api/compromisso/arquivo?user_id=${encodeURIComponent(id)}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir o termo.");
    }
  }

  async function escolherFoto(arquivo: File | null) {
    if (!arquivo) return;
    try { setFotoNova(await reduzirFoto(arquivo)); } catch (e) { setErro(e instanceof Error ? e.message : "Foto inválida."); }
  }

  async function excluir(id: number) {
    if (!window.confirm("Excluir o responsável e seu acesso de login?")) return;
    setErro(null);
    try {
      await apiDelete(`/api/responsaveis?municipio_id=${id}`);
      setMunicipios((atual) => atual.filter((municipio) => municipio.id !== id));
      if (String(id) === municipioId) setMostrarFormulario(false);
      setMensagem("Responsável excluído.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao excluir responsável.");
    }
  }

  function selecionarMunicipio(id: string) {
    const municipio = municipios.find((item) => String(item.id) === id);
    const atual = sit(municipio?.responsavel_id);
    // coordenador desativado: o formulário abre em branco para cadastrar o novo coordenador do município
    const troca = Boolean(municipio?.responsavel_id) && atual?.ativo === false;
    setSubstituindo(false);
    setMunicipioId(id);
    setNome(troca ? "" : municipio?.responsavel_nome ?? "");
    setEmail(troca ? "" : municipio?.responsavel_email ?? "");
    setCpf(troca ? "" : mascaraCpf(atual?.cpf ?? ""));
    setRg(troca ? "" : atual?.rg ?? "");
    setTelefone1(troca ? "" : mascaraTelefone(atual?.telefone1 ?? ""));
    setTelefone2(troca ? "" : mascaraTelefone(atual?.telefone2 ?? ""));
    setFotoNova("");
    setSenha("");
    setMensagem(null);
    setErro(null);
  }

  // Trocar de coordenador numa ação só: formulário em branco; ao salvar, o atual é desativado e o novo recebe o termo de compromisso
  function substituirCoordenador(idMunicipio: number) {
    setMunicipioId(String(idMunicipio));
    setNome(""); setEmail(""); setSenha("");
    setCpf(""); setRg(""); setTelefone1(""); setTelefone2(""); setFotoNova("");
    setSubstituindo(true);
    setMensagem(null);
    setErro(null);
    setMostrarFormulario(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setMensagem(null);
    if (!municipioId) {
      setErro("Selecione um município.");
      return;
    }

    setSalvando(true);
    try {
      const r = await apiPost("/api/responsaveis", {
        municipio_id: Number(municipioId),
        responsavel_nome: nome,
        responsavel_email: email,
        senha,
        cpf, rg, telefone1, telefone2,
        ...(substituindo ? { substituir: true } : {}),
        ...(fotoNova ? { foto: fotoNova } : {}),
      });
      setMensagem(
        r?.novo_usuario
          ? `Coordenador cadastrado${substituindo ? " (o anterior foi desativado e a ficha de adesão passou para o novo)" : ""}. O e-mail do termo de compromisso NÃO foi enviado: quando quiser, clique nos três pontinhos (⋮) dele em Liberados e escolha "Enviar termo de compromisso por e-mail".`
          : "Responsável salvo."
      );
      apiGet("/api/admin/coordenadores-situacao").then(setSituacao).catch(() => {});
      setSenha("");
      const listaAtualizada = await apiGet("/api/municipios?fresh=1") as Municipio[];
      setMunicipios(listaAtualizada);
      setMostrarFormulario(false);
      setSubstituindo(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar responsável.");
    } finally {
      setSalvando(false);
    }
  }

  // Abre a ficha do coordenador numa página limpa, pronta para imprimir (ou salvar em PDF)
  async function imprimirFicha(m: Municipio) {
    const x = sit(m.responsavel_id);
    const esc = (v?: string | null) => String(v ?? "—").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") || "—";
    const janela = window.open("", "_blank");
    if (!janela) { setErro("O navegador bloqueou a janela de impressão. Permita pop-ups para este site."); return; }
    let foto = "";
    try { foto = (m.responsavel_id && (await apiBlobUrl(`/api/coordenador-foto?user_id=${encodeURIComponent(m.responsavel_id)}`))) || ""; } catch { /* sem foto */ }
    let statusAdesao = "Sem adesão iniciada";
    // escolas que ele coordena: as da adesão dele (edição ativa)
    let escolas: { nome: string; quantidade_professores?: number | null; matricula_infantil_3?: number | null; matricula_infantil_4?: number | null; matricula_infantil_5?: number | null }[] = [];
    try {
      const lista = (await apiGet("/api/admin/adesoes")) as { id: string; coordenador_id?: string | null; status?: string | null; observacao_admin?: string | null }[];
      const dele = (Array.isArray(lista) ? lista : []).find((a) => a.coordenador_id && a.coordenador_id === m.responsavel_id);
      if (dele) {
        statusAdesao = dele.status === "aprovada" ? "Aprovada" : dele.status === "enviada" ? "Enviada — em análise" : dele.status === "rascunho" ? (dele.observacao_admin ? "Devolvida para correção" : "Rascunho (ainda não enviada)") : (dele.status ?? "—");
        const det = await apiGet(`/api/adesao?id=${dele.id}`);
        escolas = det?.adesao?.escolas ?? [];
      }
    } catch { /* sem escolas */ }
    const origem = window.location.origin;
    const n = (v?: number | null) => Number(v) || 0;
    const alunosDe = (e: (typeof escolas)[number]) => n(e.matricula_infantil_3) + n(e.matricula_infantil_4) + n(e.matricula_infantil_5);
    const totProf = escolas.reduce((t, e) => t + n(e.quantidade_professores), 0);
    const totAlunos = escolas.reduce((t, e) => t + alunosDe(e), 0);
    const tabelaEscolas = escolas.length
      ? `<table class="esc"><thead><tr><th>#</th><th>Escola</th><th>Professores</th><th>Infantil 3</th><th>Infantil 4</th><th>Infantil 5</th><th>Alunos</th></tr></thead><tbody>${escolas.map((e, i) => `<tr><td>${i + 1}</td><td>${esc(e.nome)}</td><td>${n(e.quantidade_professores)}</td><td>${n(e.matricula_infantil_3)}</td><td>${n(e.matricula_infantil_4)}</td><td>${n(e.matricula_infantil_5)}</td><td><strong>${alunosDe(e)}</strong></td></tr>`).join("")}</tbody><tfoot><tr><td></td><td><strong>Total</strong></td><td><strong>${totProf}</strong></td><td colspan="3"></td><td><strong>${totAlunos}</strong></td></tr></tfoot></table>`
      : `<p class="sub">Nenhuma escola marcada na adesão ainda.</p>`;
    const linha = (r: string, v?: string | null) => `<div class="c"><span>${r}</span><strong>${esc(v)}</strong></div>`;
    const ativo = x?.ativo !== false;
    janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ficha do coordenador - ${esc(m.responsavel_nome)}</title>
<style>
 body{font-family:Arial,Helvetica,sans-serif;color:#1d3a2c;margin:0;padding:32px 40px}
 .topo{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #2F6B4F;padding-bottom:14px;margin-bottom:22px}
 .topo img{height:56px}
 h1{font-size:20px;margin:0 0 4px} .sub{color:#555;font-size:13px}
 .id{display:flex;gap:22px;align-items:center;margin-bottom:22px}
 .foto{width:130px;height:160px;border:1px solid #bbb;border-radius:8px;object-fit:cover;background:#f2f2f2;display:flex;align-items:center;justify-content:center;color:#999;font-size:12px}
 .grade{display:grid;grid-template-columns:1fr 1fr;gap:14px 28px;border:1px solid #cfd8d2;border-radius:10px;padding:18px 22px}
 .c span{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7c72;margin-bottom:3px}
 .c strong{font-size:15px;word-break:break-all}
 .sit{margin-top:18px;font-size:13px} .rod{margin-top:46px;font-size:11px;color:#777;border-top:1px solid #ddd;padding-top:8px}
 h2{font-size:15px;margin:22px 0 8px}
 .status{display:flex;gap:12px;margin-top:16px} .status div{flex:1;border-radius:10px;padding:10px 12px} .status span{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px} .status strong{font-size:14px} .status .ok{background:#e3f4ea;color:#17613b} .status .pend{background:#fff3cc;color:#6e4b00} .status .ruim{background:#f8e1df;color:#9b2c25} .status .info{background:#e3edf8;color:#1d4e89}
 .resumo{display:flex;gap:14px;margin-bottom:12px} .resumo div{flex:1;border:1px solid #cfd8d2;border-radius:10px;padding:10px;text-align:center;background:#f6f9f7} .resumo strong{display:block;font-size:22px} .resumo span{font-size:11px;text-transform:uppercase;color:#6b7c72;letter-spacing:.05em}
 .esc tfoot td{background:#f6f9f7}
 .esc{width:100%;border-collapse:collapse;font-size:13px} .esc th,.esc td{border:1px solid #cfd8d2;padding:6px 8px;text-align:left} .esc th{background:#eef3ef} .esc td:first-child,.esc th:first-child{width:34px;text-align:center} .esc td:not(:nth-child(2)),.esc th:not(:nth-child(2)){text-align:center}
 @media print{body{padding:12mm 14mm} .nao-imprimir{display:none}}
</style></head><body>
<div class="topo"><img src="${origem}/logo-valores-termo.png" alt="Projeto Valores"><div style="text-align:right"><strong>Ficha do(a) Coordenador(a) Municipal</strong><div class="sub">Projeto Valores · Sistema FAEC/SENAR Ceará</div></div><img src="${origem}/logo-senar-termo.png" alt="SENAR"></div>
<div class="id">${foto ? `<img class="foto" src="${foto}" alt="Foto">` : `<div class="foto">Sem foto</div>`}
 <div><h1>${esc(m.responsavel_nome)}</h1><div class="sub">Coordenador(a) municipal · ${esc(m.nome)}</div></div></div>
<div class="grade">
 ${linha("E-mail (login)", m.responsavel_email)}${linha("CPF", x?.cpf ? mascaraCpf(x.cpf) : null)}
 ${linha("RG", x?.rg)}${linha("Município", m.nome)}
 ${linha("Telefone 1", x?.telefone1)}${linha("Telefone 2", x?.telefone2)}
</div>
<div class="status"><div class="${ativo ? "ok" : "ruim"}"><span>Acesso ao sistema</span><strong>${ativo ? "Ativo" : "Desativado"}</strong></div><div class="${x?.compromisso_em ? "ok" : "pend"}"><span>Termo de compromisso</span><strong>${x?.compromisso_em ? "Assinado em " + dataCurta(x.compromisso_em) : "Pendente"}</strong></div><div class="${statusAdesao === "Aprovada" ? "ok" : statusAdesao.startsWith("Sem") ? "pend" : "info"}"><span>Termo de adesão</span><strong>${esc(statusAdesao)}</strong></div></div>
<h2>Escolas que coordena</h2>
<div class="resumo"><div><strong>${escolas.length}</strong><span>escolas</span></div><div><strong>${totProf}</strong><span>professores</span></div><div><strong>${totAlunos}</strong><span>alunos</span></div></div>
${tabelaEscolas}
<div class="rod">Impresso em ${new Date().toLocaleString("pt-BR")}</div>
<script>window.onload=function(){setTimeout(function(){window.focus();window.print();},400);};</script>
</body></html>`);
    janela.document.close();
  }

  function acoesDe(municipio: Municipio): ItemMenu[] {
    const x = sit(municipio.responsavel_id);
    const ativo = x?.ativo !== false;
    const idResp = municipio.responsavel_id ?? "";
    return [
      { rotulo: "Editar dados", onClick: () => { setDetalheId(null); selecionarMunicipio(String(municipio.id)); setMostrarFormulario(true); window.scrollTo({ top: 0, behavior: "smooth" }); } },
      { rotulo: "Substituir coordenador", oculto: !idResp, onClick: () => { setDetalheId(null); substituirCoordenador(municipio.id); } },
      { rotulo: ativo ? "Desativar acesso" : "Ativar acesso", oculto: !idResp, onClick: () => alternarAtivo(idResp, municipio.responsavel_nome ?? "este coordenador", !ativo) },
      { rotulo: x?.compromisso_em ? "Ver termo de compromisso" : "Ver termo de compromisso (prévia)", oculto: !idResp, onClick: () => verCompromisso(idResp) },
      { rotulo: "Ver sindicato e presidente", onClick: () => verSindicato(municipio.id) },
      { rotulo: "Ver termo de adesão", oculto: !x?.adesao_id, onClick: () => window.open(`/admin/termo-adesao/${x?.adesao_id}`, "_blank") },
      { rotulo: "Enviar termo de compromisso por e-mail", oculto: !idResp || Boolean(x?.compromisso_em), onClick: () => enviarTermo(idResp, municipio.responsavel_nome ?? "este coordenador") },
      { rotulo: "Excluir", perigo: true, onClick: () => { setDetalheId(null); excluir(municipio.id); } },
    ];
  }

  const trocaAtiva = Boolean(municipioSelecionado?.responsavel_id) && (substituindo || sit(municipioSelecionado?.responsavel_id)?.ativo === false);

  const linhaSind = (rotulo: string, ...valores: (string | null | undefined)[]) => {
    const v = valores.filter(Boolean).join(" · ");
    return v ? (<div className="flex flex-col gap-0.5 border-b border-black/5 py-2 sm:flex-row sm:gap-3"><span className="w-40 shrink-0 text-xs font-semibold uppercase tracking-wide text-brand-dark/60">{rotulo}</span><span className="text-sm text-brand-dark [overflow-wrap:anywhere]">{v}</span></div>) : null;
  };

  return (
    <div className="p-3 sm:p-5">
      {sindicatoVista && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSindicatoVista(null)}>
          <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg font-bold text-brand-dark">{sindicatoVista.nome}</h3>
              <button type="button" onClick={() => setSindicatoVista(null)} className="rounded-lg px-2 py-1 text-lg leading-none text-brand-dark/60 hover:bg-black/5" aria-label="Fechar">×</button>
            </div>
            {linhaSind("Região FAEC", sindicatoVista.regiao_faec)}
            {linhaSind("Região Sebrae", sindicatoVista.regiao_sebrae)}
            {linhaSind("Sindicato rural", sindicatoVista.sindicato_nome)}
            {linhaSind("Presidente", sindicatoVista.presidente_nome)}
            {linhaSind("Telefones", sindicatoVista.telefone1, sindicatoVista.telefone2)}
            {(() => {
              const emails = [sindicatoVista.email1, sindicatoVista.email2, sindicatoVista.email3, sindicatoVista.email4].filter((x): x is string => Boolean(x));
              if (emails.length === 0) return null;
              const escolhido = (emailSel || sindicatoVista.email_termo || emails[0]).toLowerCase();
              return (
                <div className="border-b border-black/5 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark/60">Dados do presidente no termo</p>
                  <p className="mb-1 text-xs text-brand-dark/65">{emails.length > 1 ? "Há mais de um e-mail. Escolha o que será usado para assinar e informe o CPF." : "Informe o CPF para constar no termo."}</p>
                  <div className="mt-1 space-y-1">
                    {emails.map((em) => (
                      <label key={em} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm [overflow-wrap:anywhere] ${em.toLowerCase() === escolhido ? "bg-[#E2EFFB] font-semibold text-[#0F4C85]" : "hover:bg-black/[0.04]"}`}>
                        <input type="radio" name="email-termo" checked={em.toLowerCase() === escolhido} onChange={() => setEmailSel(em)} className="h-4 w-4 accent-[#2678C4]" />
                        {em}
                      </label>
                    ))}
                  </div>
                  <label className="mt-2 block text-sm font-semibold text-brand-dark">CPF do presidente
                    <input inputMode="numeric" value={cpfSel} onChange={(e) => setCpfSel(mascaraCpf(e.target.value))} placeholder="000.000.000-00" className={`${CAMPO} mt-1 font-normal`} />
                  </label>
                  <div className="mt-2 flex items-center gap-3">
                    <button type="button" onClick={() => salvarDadosSindicato(escolhido)} className="rounded-lg bg-brand-light px-4 py-2 text-sm font-semibold text-white hover:bg-brand-accent">Salvar para o termo</button>
                    {sindSalvo && <span className="text-sm font-semibold text-[#17613B]">✓ Salvo</span>}
                  </div>
                </div>
              );
            })()}
            {linhaSind("Vice-presidente", sindicatoVista.vice_presidente_texto, sindicatoVista.telefone_vice_presidente, sindicatoVista.email_vice_presidente)}
            {linhaSind("Secretário(a)", sindicatoVista.secretario_nome)}
            {!sindicatoVista.presidente_nome && !sindicatoVista.sindicato_nome && <p className="py-3 text-sm text-brand-dark/70">Este município não tem sindicato ou presidente cadastrado.</p>}
          </div>
        </div>
      )}
      <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
        <TituloPagina
          descricao="Escolha um município e crie o acesso do Coordenador Geral por Município."
          acao={
            <div className="flex items-center gap-3">
              <Indicador valor={responsaveis.length} rotulo={responsaveis.length === 1 ? "cadastrado" : "cadastrados"} />
              {!mostrarFormulario && (
            <button
              type="button"
              onClick={novoResponsavel}
              className="shrink-0 rounded-xl bg-[#2678C4] px-4 py-2 text-sm font-bold text-white shadow-md shadow-[#2678C4]/25 transition hover:-translate-y-0.5 hover:bg-[#1F67AA]"
            >
              + Inserir responsável
            </button>
              )}
            </div>
          }
        >Coordenadores</TituloPagina>

        {erro && <div className="mt-3 rounded-lg bg-status-pendente/10 px-4 py-2.5 text-sm text-status-pendente" role="alert">{erro}</div>}
        {mensagem && <div className="mt-3 rounded-lg bg-status-completo/10 px-4 py-2.5 text-sm font-medium text-status-completo">{mensagem}</div>}

        {mostrarFormulario && (
          <form onSubmit={salvar} autoComplete="off" className="mt-4 space-y-3 rounded-2xl border border-black/10 bg-[#FFFBF2] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-brand-dark">
                {municipioSelecionado?.responsavel_id && !trocaAtiva ? "Editar responsável" : "Novo responsável"}
              </h2>
              <button type="button" onClick={() => setMostrarFormulario(false)} className="rounded p-1 hover:bg-black/5" aria-label="Fechar">
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-brand-dark">
                <span className="mb-1 flex items-center gap-1.5"><BuildingIcon className="h-4 w-4" /> Município *</span>
                <select
                  id="municipio"
                  required
                  disabled={carregando}
                  value={municipioId}
                  onChange={(e) => selecionarMunicipio(e.target.value)}
                  className={`${CAMPO} disabled:opacity-50`}
                >
                  <option value="">{contemplados === null ? "Carregando..." : "Selecione um município"}</option>
                  {opcoesMunicipio.map((municipio) => <option key={municipio.id} value={municipio.id}>{municipio.nome}</option>)}
                </select>
                <span className="mt-1 block text-xs font-normal text-brand-dark/70">
                  {contemplados !== null && opcoesMunicipio.length === 0
                    ? "Nenhum município tem escolas no programa ainda. Marque as escolas em Escolas do programa."
                    : "Só aparecem os municípios que já têm escolas no programa da edição ativa."}
                </span>
              </label>

              {trocaAtiva && (
                <div className="rounded-lg bg-[#FFF3CC] px-3 py-2 text-sm text-[#6E4B00] sm:self-end">
                  {substituindo
                    ? <>Você está <strong>substituindo</strong> o coordenador atual ({municipioSelecionado?.responsavel_nome}). Ao salvar, o acesso dele é <strong>desativado</strong>, a ficha de adesão dele <strong>passa para o novo coordenador</strong> continuar, e o novo coordenador é cadastrado (use outro e-mail) e já recebe por e-mail o termo de compromisso para assinar.</>
                    : <>O coordenador atual deste município está <strong>desativado</strong>. Ao salvar, o novo coordenador será cadastrado (use outro e-mail) e receberá o termo de compromisso para assinar.</>}
                </div>
              )}

              {municipioSelecionado && (
                <>
                  <label className="block text-sm font-medium text-brand-dark sm:col-span-2">
                    <span className="mb-1 flex items-center gap-1.5"><UserIcon className="h-4 w-4" /> Nome completo *</span>
                    <input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do responsável" maxLength={120} className={CAMPO} />
                  </label>
                  <label className="block text-sm font-medium text-brand-dark">
                    <span className="mb-1 block">CPF {municipioSelecionado.responsavel_id && !trocaAtiva ? "" : "*"}</span>
                    <input id="cpf" inputMode="numeric" required={!municipioSelecionado.responsavel_id || trocaAtiva} placeholder="000.000.000-00" value={cpf}
                      onChange={(e) => setCpf(mascaraCpf(e.target.value))} className={CAMPO} />
                  </label>
                  <label className="block text-sm font-medium text-brand-dark">
                    <span className="mb-1 block">RG</span>
                    <input id="rg" value={rg} onChange={(e) => setRg(e.target.value)} maxLength={30} className={CAMPO} />
                  </label>
                  <label className="block text-sm font-medium text-brand-dark">
                    <span className="mb-1 block">Contato (telefone) {municipioSelecionado.responsavel_id && !trocaAtiva ? "" : "*"}</span>
                    <input id="telefone1" inputMode="tel" required={!municipioSelecionado.responsavel_id || trocaAtiva} placeholder="(00) 00000-0000" value={telefone1}
                      onChange={(e) => setTelefone1(mascaraTelefone(e.target.value))} className={CAMPO} />
                  </label>
                  <label className="block text-sm font-medium text-brand-dark">
                    <span className="mb-1 block">Outro contato <span className="font-normal text-brand-dark/60">(opcional)</span></span>
                    <input id="telefone2" inputMode="tel" placeholder="(00) 00000-0000" value={telefone2}
                      onChange={(e) => setTelefone2(mascaraTelefone(e.target.value))} className={CAMPO} />
                  </label>
                  <label className="block text-sm font-medium text-brand-dark">
                    <span className="mb-1 flex items-center gap-1.5"><MailIcon className="h-4 w-4" /> E-mail (login) *</span>
                    <input
                      id="email"
                      name="responsavelEmail"
                      required
                      type="email"
                      autoComplete="new-username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="responsavel@exemplo.com"
                      className={CAMPO}
                    />
                  </label>
                  <label className="block text-sm font-medium text-brand-dark">
                    <span className="mb-1 flex items-center gap-1.5">
                      <LockIcon className="h-4 w-4" /> Senha{" "}
                      {municipioSelecionado.responsavel_id && !trocaAtiva ? <span className="font-normal text-brand-dark/70">(deixe vazio para manter a atual)</span> : "*"}
                    </span>
                    <input
                      id="senha"
                      name="responsavelSenha"
                      required={!municipioSelecionado.responsavel_id || trocaAtiva}
                      minLength={6}
                      type="password"
                      autoComplete="new-password"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      placeholder="Mínimo de 6 caracteres"
                      className={CAMPO}
                    />
                  </label>
                  <div className="flex items-center gap-3 sm:col-span-2">
                    {fotoNova ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={fotoNova} alt="Foto escolhida" className="h-12 w-12 rounded-full border border-black/10 object-cover" />
                    ) : (
                      <FotoCoordenador userId={trocaAtiva ? null : municipioSelecionado.responsavel_id} nome={nome} tamanho={48} />
                    )}
                    <div>
                      <label htmlFor="foto" className="inline-block cursor-pointer rounded-lg border border-brand-light px-3 py-1.5 text-sm font-semibold text-brand-light hover:bg-brand-light/5">
                        {fotoNova ? "Trocar foto" : "Escolher foto"}
                      </label>
                      <input id="foto" type="file" accept="image/*" className="sr-only" onChange={(ev) => { escolherFoto(ev.target.files?.[0] ?? null); ev.target.value = ""; }} />
                      <p className="mt-0.5 text-xs text-brand-dark/70">Opcional. A foto fica guardada no Google Drive.</p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {municipioSelecionado && (
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={salvando}
                  className="rounded-xl bg-[#2F9E62] px-5 py-2 text-sm font-bold text-white shadow-sm hover:brightness-110 disabled:opacity-50"
                >
                  {salvando ? "Salvando acesso..." : "Salvar"}
                </button>
                <button type="button" onClick={() => setMostrarFormulario(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-brand-dark/80 hover:bg-black/5">
                  Cancelar
                </button>
              </div>
            )}
          </form>
        )}

        {aba === null && <p className="mt-5 text-sm text-brand-dark/75">Carregando...</p>}
        {aba !== null && (responsaveis.length > 0 || (cadastros?.length ?? 0) > 0) && (
          <>
            <Abas<"aguardando" | "liberados" | "desativados">
              className="mt-5"
              abas={[
                { valor: "aguardando", rotulo: "Aguardando liberação", contagem: cadastros?.length ?? 0 },
                { valor: "liberados", rotulo: "Liberados", contagem: responsaveis.length },
                { valor: "desativados", rotulo: "Desativados", contagem: desativados.length },
              ]}
              valor={aba}
              onChange={setAba}
            />
            <BarraFiltros
              colunas="grid-cols-1 sm:grid-cols-[minmax(0,1fr)_16rem]"
              mostrarLimpar={Boolean(busca.trim()) || Boolean(filtroMunicipio)}
              onLimpar={() => { setBusca(""); setFiltroMunicipio(""); }}
              resumo={busca.trim() || filtroMunicipio ? (aba === "aguardando" ? `${cadastrosFiltrados.length} de ${cadastros?.length ?? 0}` : `${filtrados.length} de ${responsaveis.length}`) : undefined}
            >
              <CampoBusca value={busca} onChange={setBusca} placeholder="Pesquisar por nome, e-mail, CPF ou município..." ariaLabel="Pesquisar coordenadores" />
              <select aria-label="Filtrar por município" value={filtroMunicipio} onChange={(e) => setFiltroMunicipio(e.target.value)} className={CLASSE_SELECT}>
                <option value="">Município: todos</option>
                {opcoesFiltro.map(([id, nomeMun]) => <option key={id} value={id}>{nomeMun}</option>)}
              </select>
            </BarraFiltros>
          </>
        )}

        {aba === "aguardando" && (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-brand-dark/75">
              Coordenadores que se cadastraram pelo link de adesão. O município é liberado quando você aprova a adesão deles em <strong>Termo de Adesão</strong>.
            </p>
            {cadastros && cadastros.length === 0 && (
              <div className="rounded-xl border border-dashed border-black/10 p-6 text-center text-sm text-brand-dark/75">Nenhum cadastro aguardando liberação.</div>
            )}
            {cadastros && cadastros.length > 0 && cadastrosFiltrados.length === 0 && (
              <div className="rounded-xl border border-dashed border-black/10 p-6 text-center text-sm text-brand-dark/75">Nenhum cadastro encontrado com esses filtros.</div>
            )}
            {cadastrosFiltrados.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-black/5 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-black/5 bg-[#F6F9F7]">
                      <tr>
                        <Th col="nome" ordem={ordem} onOrdem={setOrdem}>Nome</Th>
                        <Th col="email" ordem={ordem} onOrdem={setOrdem}>E-mail e telefone</Th>
                        <Th col="municipio" ordem={ordem} onOrdem={setOrdem}>Município</Th>
                        <Th col="adesao" ordem={ordem} onOrdem={setOrdem}>Adesão</Th>
                        <Th>Acesso</Th>
                        <Th col="cadastro" ordem={ordem} onOrdem={setOrdem}>Cadastro</Th>
                        <Th className="text-right">Ações</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/15">
                      {cadastrosFiltrados.slice((pagina - 1) * porPagina, pagina * porPagina).map((c) => {
                        const st = SITUACAO[c.adesao_status];
                        return (
                          <tr key={c.user_id} onClick={() => {
                            // quem já foi liberado (é o coordenador de um município) abre a ficha completa
                            const liberado = municipios.find((m) => m.responsavel_id === c.user_id);
                            if (liberado) setDetalheId(liberado.id); else setDetalheCad(c);
                          }} className="cursor-pointer hover:bg-[#F3FAF6]" title="Clique para ver todos os dados">
                            <td className="px-4 py-[18px]">
                              <div className="flex items-center gap-3">
                                <FotoCoordenador userId={c.user_id} nome={c.nome} />
                                <div className="min-w-0">
                                  <span className="block font-bold text-brand-dark">{c.nome}</span>
                                  <span className="block whitespace-nowrap text-xs text-brand-dark/65">CPF {c.cpf ? mascaraCpf(c.cpf) : "—"}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-[18px]">
                              <span className="block whitespace-nowrap text-brand-dark">{c.email}</span>
                              <span className="block whitespace-nowrap text-xs text-brand-dark/65">{c.telefone1 ?? "—"}</span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-[18px] font-medium">{c.municipio_nome ?? "—"}</td>
                            <td className="px-4 py-[18px]"><span className="inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold" style={{ background: st.fundo, color: st.cor }} title={`Adesão: ${st.texto}`}>{st.texto}</span></td>
                            <td className="px-4 py-[18px]">
                              {sit(c.user_id)?.ativo === false
                                ? <Pilula texto="Desativado" fundo="#F8E1DF" cor="#9B2C25" />
                                : <Pilula texto="Ativo" fundo="#E3F4EA" cor="#17613B" />}
                            </td>
                            <td className="whitespace-nowrap px-4 py-[18px] text-brand-dark/70">{dataCurta(c.cadastrado_em)}{diasParado(c.cadastrado_em, c.adesao_status) && <span className="block text-xs font-semibold text-[#9B5A00]">{diasParado(c.cadastrado_em, c.adesao_status)}</span>}</td>
                            <td className="px-4 py-[18px] text-right" onClick={(e) => e.stopPropagation()}>
                              <MenuAcoes rotulo={c.nome ?? "coordenador"} itens={[
                                { rotulo: "Abrir termo de adesão", oculto: !(c.adesao_id && c.adesao_status !== "rascunho"), onClick: () => window.open(`/admin/termo-adesao/${c.adesao_id}`, "_blank") },
                                { rotulo: "Desativar cadastro", onClick: () => desativarCadastro(c.user_id, c.nome ?? "este coordenador") },
                              ]} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-black/5"><RodapeTabela pagina={pagina} total={cadastrosFiltrados.length} porPagina={porPagina} onChange={setPagina} /></div>
              </div>
            )}
          </div>
        )}

        {aba === "desativados" && (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-brand-dark/75">Coordenadores que perderam o acesso: desativados ou substituídos por outro no município. Nada é apagado.</p>
            {desativados.length === 0 && <div className="rounded-xl border border-dashed border-black/10 p-6 text-center text-sm text-brand-dark/75">Nenhum coordenador desativado.</div>}
            {desativados.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-black/5 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-black/5 bg-[#F6F9F7]">
                      <tr>
                        <Th>Nome</Th>
                        <Th>E-mail e telefone</Th>
                        <Th>Município</Th>
                        <Th>Situação</Th>
                        <Th>Desativado em</Th>
                        <Th>Cadastro</Th>
                        <Th className="text-right">Ações</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/15">
                      {desativados.map((d) => (
                        <tr key={d.user_id} className="hover:bg-[#F3FAF6]">
                          <td className="px-4 py-[18px]">
                            <div className="flex items-center gap-3">
                              <FotoCoordenador userId={d.user_id} nome={d.nome} />
                              <div className="min-w-0">
                                <span className="block font-bold text-brand-dark">{d.nome}</span>
                                <span className="block whitespace-nowrap text-xs text-brand-dark/65">CPF {d.cpf ? mascaraCpf(d.cpf) : "—"}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-[18px]">
                            <span className="block whitespace-nowrap text-brand-dark">{d.email}</span>
                            <span className="block whitespace-nowrap text-xs text-brand-dark/65">{d.telefone1 ?? "—"}</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-[18px] font-medium">{d.municipio_nome ?? "—"}</td>
                          <td className="px-4 py-[18px]"><Pilula texto={d.substituido ? "Substituído" : "Desativado"} fundo="#F8E1DF" cor="#9B2C25" /></td>
                          <td className="whitespace-nowrap px-4 py-[18px] text-brand-dark/70">{d.desativado_em ? dataCurta(d.desativado_em) : "—"}</td>
                          <td className="whitespace-nowrap px-4 py-[18px] text-brand-dark/70">{d.created_at ? dataCurta(d.created_at) : "—"}</td>
                          <td className="px-4 py-[18px] text-right">
                            <MenuAcoes rotulo={d.nome ?? "coordenador"} itens={[
                              { rotulo: "Ver termo de compromisso", onClick: () => verCompromisso(d.user_id) },
                              { rotulo: "Ativar acesso", oculto: d.substituido, onClick: () => alternarAtivo(d.user_id, d.nome ?? "este coordenador", true) },
                            ]} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {aba === "liberados" && (
        <div className="mt-3 space-y-3">
          {carregando && <p className="text-sm text-brand-dark/75">Carregando...</p>}
          {!carregando && responsaveis.length === 0 && !mostrarFormulario && (
            <div className="rounded-xl border border-dashed border-black/10 p-6 text-center text-sm text-brand-dark/75">
              Nenhum responsável cadastrado ainda. Clique em &quot;+ Inserir responsável&quot;.
            </div>
          )}
          {responsaveis.length > 0 && filtrados.length === 0 && (
            <div className="rounded-xl border border-dashed border-black/10 p-6 text-center text-sm text-brand-dark/75">Nenhum responsável encontrado com esses filtros.</div>
          )}
          {filtrados.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-black/5 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-black/5 bg-[#F6F9F7]">
                    <tr>
                      <Th col="nome" ordem={ordem} onOrdem={setOrdem}>Coordenador</Th>
                      <Th col="email" ordem={ordem} onOrdem={setOrdem}>E-mail e telefone</Th>
                      <Th col="municipio" ordem={ordem} onOrdem={setOrdem}>Município</Th>
                      <Th col="situacao" ordem={ordem} onOrdem={setOrdem}>Acesso</Th>
                      <Th col="compromisso" ordem={ordem} onOrdem={setOrdem}>Compromisso</Th>
                      <Th className="text-right">Ações</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/15">
                    {filtrados.slice((pagina - 1) * porPagina, pagina * porPagina).map((municipio) => {
                      const x = sit(municipio.responsavel_id);
                      const ativo = x?.ativo !== false;
                      const idResp = municipio.responsavel_id ?? "";
                      return (
                        <tr key={municipio.id} onClick={() => setDetalheId(municipio.id)}
                          className={`cursor-pointer hover:bg-[#F3FAF6] ${ativo ? "" : "opacity-70"}`} title="Clique para ver todos os dados">
                          <td className="px-4 py-[18px]">
                            <div className="flex items-center gap-3">
                              <FotoCoordenador userId={idResp} nome={municipio.responsavel_nome} tamanho={44} />
                              <div className="min-w-0">
                                <span className="block font-bold text-brand-dark">{municipio.responsavel_nome}</span>
                                <span className="block whitespace-nowrap text-xs text-brand-dark/65">CPF {x?.cpf ? mascaraCpf(x.cpf) : "—"}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-[18px]">
                            <span className="block whitespace-nowrap text-brand-dark">{municipio.responsavel_email}</span>
                            <span className="block whitespace-nowrap text-xs text-brand-dark/65">{x?.telefone1 || "—"}</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-[18px] font-medium">{municipio.nome}</td>
                          <td className="px-4 py-[18px]">
                            {ativo ? <Pilula texto="Ativo" fundo="#E3F4EA" cor="#17613B" /> : <Pilula texto="Desativado" fundo="#F8E1DF" cor="#9B2C25" />}
                          </td>
                          <td className="px-4 py-[18px]">
                            {x?.compromisso_em
                              ? <Pilula texto="Assinado" fundo="#E3F4EA" cor="#17613B" />
                              : <Pilula texto="Pendente" fundo="#FFF3CC" cor="#6E4B00" />}
                          </td>
                          <td className="px-4 py-[18px] text-right" onClick={(e) => e.stopPropagation()}><MenuAcoes rotulo={municipio.responsavel_nome ?? municipio.nome} itens={acoesDe(municipio)} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-black/5"><RodapeTabela pagina={pagina} total={filtrados.length} porPagina={porPagina} onChange={setPagina} /></div>
            </div>
          )}
        </div>
        )}
      </div>
      {detalheId !== null && (() => {
        const m = municipios.find((i) => i.id === detalheId);
        if (!m) return null;
        if (historico === null) return null; // espera o histórico chegar: a janela abre uma vez só, já completa
        const x = sit(m.responsavel_id);
        const ativo = x?.ativo !== false;
        const Campo = ({ rotulo, valor }: { rotulo: string; valor?: string | null }) => (
          <div><p className="text-xs font-bold uppercase tracking-wide text-brand-dark/55">{rotulo}</p><p className="mt-0.5 break-all text-[15px] text-brand-dark">{valor || "—"}</p></div>
        );
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetalheId(null)} role="dialog" aria-modal="true">
            <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start gap-4">
                <FotoCoordenador userId={m.responsavel_id ?? ""} nome={m.responsavel_nome} tamanho={88} />
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-extrabold text-brand-dark">{m.responsavel_nome}</h2>
                  <p className="text-sm text-brand-dark/70">Coordenador(a) municipal · {m.nome}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ativo ? <Pilula texto="Acesso ativo" fundo="#E3F4EA" cor="#17613B" /> : <Pilula texto="Acesso desativado" fundo="#F8E1DF" cor="#9B2C25" />}
                    {x?.compromisso_em ? <Pilula texto={`Compromisso assinado em ${dataCurta(x.compromisso_em)}`} fundo="#E3F4EA" cor="#17613B" /> : <Pilula texto="Compromisso pendente" fundo="#FFF3CC" cor="#6E4B00" />}
                  </div>
                </div>
                <button type="button" onClick={() => setDetalheId(null)} className="rounded-lg px-2 py-1 text-2xl leading-none text-brand-dark/60 hover:bg-black/5" aria-label="Fechar">×</button>
              </div>
              <div className="mt-5 grid gap-x-6 gap-y-4 rounded-2xl bg-[#F6F9F7] p-5 sm:grid-cols-2">
                <Campo rotulo="E-mail (login)" valor={m.responsavel_email} />
                <Campo rotulo="CPF" valor={x?.cpf ? mascaraCpf(x.cpf) : null} />
                <Campo rotulo="RG" valor={x?.rg} />
                <Campo rotulo="Município" valor={m.nome} />
                <Campo rotulo="Telefone 1" valor={x?.telefone1} />
                <Campo rotulo="Telefone 2" valor={x?.telefone2} />
              </div>
              {historico && historico.length > 1 && (
                <div className="mt-5">
                  <h3 className="text-sm font-bold text-brand-dark">Histórico de coordenadores de {m.nome} ({historico.length})</h3>
                  <ul className="mt-2 divide-y divide-black/5 rounded-2xl border border-black/5">
                    {historico.map((h) => (
                      <li key={h.user_id} className="flex items-center gap-3 px-3 py-2.5">
                        <FotoCoordenador userId={h.user_id} nome={h.nome} tamanho={36} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-brand-dark">{h.nome} {h.atual && <span className="ml-1 rounded-full bg-[#E3F4EA] px-2 py-0.5 text-[11px] font-bold text-[#17613B]">Atual</span>}</p>
                          <p className="truncate text-xs text-brand-dark/70">{h.email}{h.cpf ? ` · CPF ${mascaraCpf(h.cpf)}` : ""}</p>
                          <p className="text-xs text-brand-dark/60">
                            De {dataCurta(h.desde)} {h.atual ? "até hoje" : `até ${dataCurta(h.ate)}`} · {h.ativo ? "acesso ativo" : "acesso desativado"} · {h.compromisso_em ? `compromisso assinado em ${dataCurta(h.compromisso_em)}` : "compromisso não assinado"}
                          </p>
                        </div>
                        {h.compromisso_em && !h.atual && (
                          <button type="button" onClick={() => verCompromisso(h.user_id)} className="shrink-0 rounded-lg border border-brand-light px-3 py-1.5 text-xs font-semibold text-brand-light hover:bg-brand-light/5">Ver termo</button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={() => imprimirFicha(m)}
                  className="rounded-lg border border-brand-light px-4 py-2 text-sm font-semibold text-brand-light hover:bg-brand-light/5">
                  🖨 Imprimir ficha
                </button>
                {acoesDe(m).filter((i) => !i.oculto).map((i) => (
                  <button key={i.rotulo} type="button" onClick={i.onClick}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold ${i.perigo ? "border border-red-300 text-red-700 hover:bg-red-50" : "bg-brand-light text-white hover:bg-brand-accent"}`}>
                    {i.rotulo}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
      {detalheCad && (() => {
        const c = detalheCad;
        const x = sit(c.user_id);
        const st = SITUACAO[c.adesao_status];
        const ativo = x?.ativo !== false;
        const Campo = ({ rotulo, valor }: { rotulo: string; valor?: string | null }) => (
          <div><p className="text-xs font-bold uppercase tracking-wide text-brand-dark/55">{rotulo}</p><p className="mt-0.5 break-all text-[15px] text-brand-dark">{valor || "—"}</p></div>
        );
        const comoMunicipio = { id: c.municipio_id ?? 0, nome: c.municipio_nome ?? "", responsavel_id: c.user_id, responsavel_nome: c.nome, responsavel_email: c.email } as Municipio;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetalheCad(null)} role="dialog" aria-modal="true">
            <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start gap-4">
                <FotoCoordenador userId={c.user_id} nome={c.nome} tamanho={88} />
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-extrabold text-brand-dark">{c.nome}</h2>
                  <p className="text-sm text-brand-dark/70">Coordenador(a) · {c.municipio_nome ?? "sem município"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Pilula texto={`Adesão: ${st.texto}`} fundo={st.fundo} cor={st.cor} />
                    {x?.compromisso_em ? <Pilula texto={`Compromisso assinado em ${dataCurta(x.compromisso_em)}`} fundo="#E3F4EA" cor="#17613B" /> : <Pilula texto="Compromisso pendente" fundo="#FFF3CC" cor="#6E4B00" />}
                    {!ativo && <Pilula texto="Acesso desativado" fundo="#F8E1DF" cor="#9B2C25" />}
                  </div>
                </div>
                <button type="button" onClick={() => setDetalheCad(null)} className="rounded-lg px-2 py-1 text-2xl leading-none text-brand-dark/60 hover:bg-black/5" aria-label="Fechar">×</button>
              </div>
              <div className="mt-5 grid gap-x-6 gap-y-4 rounded-2xl bg-[#F6F9F7] p-5 sm:grid-cols-2">
                <Campo rotulo="E-mail (login)" valor={c.email} />
                <Campo rotulo="CPF" valor={c.cpf ? mascaraCpf(c.cpf) : null} />
                <Campo rotulo="RG" valor={x?.rg} />
                <Campo rotulo="Município" valor={c.municipio_nome} />
                <Campo rotulo="Telefone 1" valor={c.telefone1} />
                <Campo rotulo="Telefone 2" valor={x?.telefone2 ?? c.telefone2} />
                <Campo rotulo="Cadastrado em" valor={dataCurta(c.cadastrado_em)} />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={() => imprimirFicha(comoMunicipio)}
                  className="rounded-lg border border-brand-light px-4 py-2 text-sm font-semibold text-brand-light hover:bg-brand-light/5">🖨 Imprimir ficha</button>
                {x?.compromisso_em && (
                  <button type="button" onClick={() => verCompromisso(c.user_id)} className="rounded-lg bg-brand-light px-4 py-2 text-sm font-semibold text-white hover:bg-brand-accent">Ver termo de compromisso (PDF)</button>
                )}
                {!x?.compromisso_em && (
                  <button type="button" onClick={() => verCompromisso(c.user_id)} className="rounded-lg border border-brand-light px-4 py-2 text-sm font-semibold text-brand-light hover:bg-brand-light/5">Ver termo de compromisso (prévia)</button>
                )}
                {!x?.compromisso_em && (
                  <button type="button" onClick={() => enviarTermo(c.user_id, c.nome ?? "este coordenador")} className="rounded-lg bg-brand-light px-4 py-2 text-sm font-semibold text-white hover:bg-brand-accent">Enviar termo de compromisso por e-mail</button>
                )}
                {c.adesao_id && c.adesao_status !== "rascunho" && (
                  <button type="button" onClick={() => window.open(`/admin/termo-adesao/${c.adesao_id}`, "_blank")} className="rounded-lg bg-brand-light px-4 py-2 text-sm font-semibold text-white hover:bg-brand-accent">Abrir termo de adesão</button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
