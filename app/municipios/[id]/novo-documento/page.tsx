"use client";

import { TituloPagina } from "@/components/TituloPagina";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AcaoPedagogica, apiGet, apiPost, apiUploadDireto, Escola, Municipio, TipoDocumento } from "@/lib/api";
import { comprimirVideoSeNecessario } from "@/lib/comprimirVideoNoNavegador";
import {
  UploadCloudIcon,
  ImageIcon,
  FileTextIcon,
  ClipboardListIcon,
  VideoIcon,
  FolderIcon,
  LightbulbIcon,
  CheckIcon,
  XIcon,
  MapPinIcon,
  CalendarIcon,
  PaperclipIcon,
  LinkIcon,
} from "@/components/icons";
import { PreviaDoLink } from "@/components/PreviaDoLink";

const MAX_FILE_MB = 500;
const FORMATOS_ACEITOS = ".jpg,.jpeg,.png,.heic,.pdf,.mp4,.mov";
const FORMATOS_PDF = ".pdf";
const FORMATOS_MIDIA = ".jpg,.jpeg,.png,.heic,.mp4,.mov";

// Info fixa de apoio: o que cada tipo de arquivo representa e sua finalidade.
// Casamento é feito pelo nome do tipo vindo do banco (tabela tipos_documento).
const INFO_TIPOS: Record<
  string,
  { Icone: (p: { className?: string }) => JSX.Element; cor: string; finalidade: string; badge: string }
> = {
  "Imagem": {
    Icone: ImageIcon,
    cor: "bg-blue-50 text-blue-600",
    badge: "bg-blue-50 text-blue-700",
    finalidade: "Comprovação visual das ações realizadas.",
  },
  "PDF": {
    Icone: FileTextIcon,
    cor: "bg-emerald-50 text-emerald-600",
    badge: "bg-emerald-50 text-emerald-700",
    finalidade: "Só para os documentos do projeto: relatórios e listas de presença das formações e o portfólio.",
  },
  "Vídeo": {
    Icone: VideoIcon,
    cor: "bg-purple-50 text-purple-600",
    badge: "bg-purple-50 text-purple-700",
    finalidade: "Comprovação audiovisual da realização da ação.",
  },
  "Outros": {
    Icone: FolderIcon,
    cor: "bg-teal-50 text-teal-600",
    badge: "bg-teal-50 text-teal-700",
    finalidade: "Apoio e complementação das informações.",
  },
};

const ehPdf = (arquivo: File) => /\.pdf$/i.test(arquivo.name) || arquivo.type === "application/pdf";

const DICAS = [
  "Escolha primeiro o que vai enviar: o registro de uma ação (vídeo ou imagem) ou um documento (PDF: relatório ou lista de presença das formações, ou o portfólio).",
  "Use descrições claras e objetivas.",
  "Prefira salvar os arquivos em boa qualidade.",
  "Vídeo longo ou muito pesado? Em vez de enviar o arquivo, cole o link (YouTube, Google Drive ou Instagram) no campo de link, mais abaixo.",
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function NovoDocumentoPage() {
  const { id: municipioIdRota } = useParams<{ id: string }>();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [municipioId, setMunicipioId] = useState(municipioIdRota ?? "");
  const [tipos, setTipos] = useState<TipoDocumento[]>([]);
  const [acoes, setAcoes] = useState<AcaoPedagogica[]>([]);
  const [escolas, setEscolas] = useState<Escola[]>([]);

  const [tipoId, setTipoId] = useState("");
  const [categoria, setCategoria] = useState<"" | "acao" | "documento">(""); // o que está sendo enviado
  const [acaoId, setAcaoId] = useState("");
  const [subtipo, setSubtipo] = useState("");
  const [acaoEvento, setAcaoEvento] = useState("");
  const [escolaId, setEscolaId] = useState("");
  const [jaEnviadas, setJaEnviadas] = useState<string[]>([]); // escolas que já tiveram este documento enviado antes
  const [escolasSel, setEscolasSel] = useState<string[]>([]); // formações: o relatório pode valer para várias escolas
  // a data de realização já vem com o dia de hoje (pode voltar para um dia anterior, mas não para o futuro)
  const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const [dataRealizacao, setDataRealizacao] = useState(hojeISO);
  const [descricao, setDescricao] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [linkExterno, setLinkExterno] = useState("");
  const [arrastando, setArrastando] = useState(false);
  const [arquivoLista, setArquivoLista] = useState<File | null>(null); // formações: a lista de presença vai no mesmo envio do relatório

  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [etapa, setEtapa] = useState<"compactando" | "enviando" | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiGet("/api/tipos-documento")
      .then((t) => {
        console.log("[tipos-documento] OK, veio:", t);
        setTipos(t);
      })
      .catch((e) => {
        console.error("[tipos-documento] ERRO:", e);
        setErro(e instanceof Error ? `Não foi possível carregar os tipos de documento: ${e.message}` : "Não foi possível carregar os tipos de documento.");
      });
    apiGet("/api/acoes-pedagogicas")
      .then(setAcoes)
      .catch((e) => {
        console.error("[acoes-pedagogicas] ERRO:", e);
        setErro(e instanceof Error ? `Não foi possível carregar as ações pedagógicas: ${e.message}` : "Não foi possível carregar as ações pedagógicas.");
      });
    apiGet("/api/municipios")
      .then((lista: Municipio[]) => {
        setMunicipios(lista);
        // Se a página foi aberta sem um município na URL (ou ele não existe mais),
        // cai pro primeiro da lista pra sempre ter algo selecionado.
        setMunicipioId((atual) => (atual && lista.some((m) => String(m.id) === String(atual)) ? atual : String(lista[0]?.id ?? "")));
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (!municipioId) return;
    apiGet(`/api/escolas?municipio_id=${municipioId}&participantes=1`).then(setEscolas).catch(() => null);
    setEscolaId("");
  }, [municipioId]);

  const municipio = useMemo(
    () => municipios.find((m) => String(m.id) === String(municipioId)) ?? null,
    [municipios, municipioId]
  );
  const tipoSelecionado = useMemo(() => tipos.find((t) => t.id === tipoId)?.nome, [tipos, tipoId]);
  const acaoSelecionada = useMemo(() => acoes.find((a) => a.id === acaoId) ?? null, [acoes, acaoId]);
  const tipoPdf = useMemo(() => tipos.find((t) => t.nome === "PDF") ?? null, [tipos]);
  const exigePdf = Boolean(acaoSelecionada?.exige_pdf);
  const ehFormacao = subtipo.startsWith("Relatório de Formação") || subtipo.startsWith("Lista de Presença"); // vale para várias escolas
  // o "par" da formação: quem escolheu o relatório pode mandar junto a lista de presença (e vice-versa), se quiser
  const subtipoPar = subtipo.startsWith("Relatório de Formação")
    ? subtipo.replace("Relatório de Formação", "Lista de Presença")
    : subtipo.startsWith("Lista de Presença") ? subtipo.replace("Lista de Presença", "Relatório de Formação") : "";
  const parDisponivel = Boolean(subtipoPar) && Boolean(acaoSelecionada?.subtipos?.includes(subtipoPar));
  const rotuloCurto = (t: string) => t.replace("Relatório de Formação", "Relatório");
  useEffect(() => {
    if (!ehFormacao || !municipioId || !subtipo) { setJaEnviadas([]); return; }
    apiGet(`/api/entregas-escolas?municipio_id=${municipioId}&subtipo=${encodeURIComponent(subtipo)}`)
      .then((r: { escola_ids: string[] }) => {
        const ids = (r.escola_ids ?? []).map(String);
        setJaEnviadas(ids);
        setEscolasSel((atual) => atual.filter((x) => !ids.includes(x)));
      })
      .catch(() => setJaEnviadas([]));
  }, [ehFormacao, municipioId, subtipo]);
  const faltam = escolas.filter((e) => !jaEnviadas.includes(String(e.id)));
  const apenasMidia = categoria === "acao"; // registro de ação: vídeo ou imagem, sem PDF
  const grupoDocumentos = useMemo(() => acoes.find((a) => a.exige_pdf) ?? null, [acoes]); // "Documentos" (PDF)

  // Documentos: o arquivo é sempre PDF
  useEffect(() => {
    if (exigePdf && tipoPdf) setTipoId(tipoPdf.id);
  }, [exigePdf, tipoPdf]);

  function escolherCategoria(nova: "acao" | "documento") {
    setCategoria(nova);
    setSubtipo("");
    setErro(null);
    if (nova === "documento") {
      if (grupoDocumentos) escolherAcao(grupoDocumentos.id);
    } else {
      setAcaoId("");
      setArquivos((atual) => atual.filter((f) => !ehPdf(f)));
      if (tipoId && tipoId === tipoPdf?.id) setTipoId("");
    }
  }

  function escolherAcao(id: string) {
    setAcaoId(id);
    setSubtipo("");
    const nova = acoes.find((a) => a.id === id);
    if (!nova) return;
    if (nova.exige_pdf) {
      setArquivos((atual) => atual.filter(ehPdf));
    } else {
      setArquivos((atual) => atual.filter((f) => !ehPdf(f)));
      if (tipoId && tipoId === tipoPdf?.id) setTipoId("");
    }
  }

  function adicionarArquivos(lista: FileList | File[]) {
    const todos = Array.from(lista);
    const doTipo = exigePdf ? todos.filter(ehPdf) : apenasMidia ? todos.filter((f) => !ehPdf(f)) : todos;
    const foraDoTipo = todos.length - doTipo.length;
    const novos = doTipo.filter((f) => f.size <= MAX_FILE_MB * 1024 * 1024);
    const grandes = doTipo.length - novos.length;
    // formação: aqui vai um PDF só (o do tipo escolhido). O outro documento da formação vai no campo "Também enviar".
    const soUm = ehFormacao;
    setArquivos((atual) => (soUm ? novos.slice(0, 1) : [...atual, ...novos]));
    if (fileInputRef.current) fileInputRef.current.value = "";
    const avisos = [
      soUm && novos.length > 1 ? "Neste campo vai um PDF só: o do tipo escolhido. O outro documento da formação vai no campo \"Também enviar\"." : "",
      foraDoTipo > 0
        ? `${foraDoTipo} arquivo(s) ignorado(s): ${exigePdf ? "documentos aceitam só PDF" : "o registro de ação aceita só vídeo ou imagem (PDF é para Documentos)"}.`
        : "",
      grandes > 0 ? `${grandes} arquivo(s) ignorado(s) por passar de ${MAX_FILE_MB}MB.` : "",
    ].filter(Boolean);
    setErro(avisos.length ? avisos.join(" ") : null);
  }

  function removerArquivo(index: number) {
    setArquivos((atual) => atual.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (!municipioId || !tipoId || !dataRealizacao || (!exigePdf && !descricao)) {
      setErro("Preencha os campos obrigatórios.");
      return;
    }
    if (!categoria) {
      setErro("Escolha o que vai enviar: o registro de uma ação ou um documento.");
      return;
    }
    if (ehFormacao ? escolasSel.length === 0 : !escolaId) {
      setErro(ehFormacao ? "Marque ao menos uma escola do programa a que o relatório se refere." : "Escolha a escola do programa a que este envio se refere.");
      return;
    }
    if (!acaoId) {
      setErro(categoria === "documento" ? "Os documentos ainda não estão configurados. Fale com o administrador." : "Escolha a ação pedagógica realizada.");
      return;
    }
    if (acaoSelecionada?.subtipos?.length && !subtipo) {
      setErro(`Escolha o tipo de documento: ${acaoSelecionada.subtipos.join(", ")}.`);
      return;
    }
    if (exigePdf && (arquivos.some((f) => !ehPdf(f)) || (arquivos.length === 0 && linkExterno))) {
      setErro("Documentos devem ser enviados em PDF.");
      return;
    }
    if (apenasMidia && (arquivos.some(ehPdf) || tipoId === tipoPdf?.id)) {
      setErro("PDF é só para Documentos. No registro de uma ação, envie vídeo ou imagem.");
      return;
    }
    if (ehFormacao && parDisponivel && arquivoLista && !ehPdf(arquivoLista)) {
      setErro("A lista de presença deve ser enviada em PDF.");
      return;
    }
    if (arquivos.length === 0 && !linkExterno && !(ehFormacao && parDisponivel && arquivoLista)) {
      setErro("Selecione ao menos um arquivo ou informe um link alternativo.");
      return;
    }

    setEnviando(true);
    setProgresso(null);
    setEtapa(null);
    try {
      const tipoNome = tipos.find((t) => t.id === tipoId)?.nome ?? "Outros";

      const metadados = {
        municipio_id: municipioId,
        tipo_id: tipoId,
        acao_evento: acaoEvento,
        escola_id: escolaId,
        acao_pedagogica_id: acaoId || undefined,
        subtipo: subtipo || undefined,
        descricao,
        data_realizacao: dataRealizacao,
      };

      // formações: um envio só, valendo para todas as escolas marcadas
      const idsEscolas = ehFormacao ? escolasSel : [escolaId];
      const registrar = async (extra: Record<string, unknown>) => {
        // um envio só, valendo para todas as escolas marcadas
        await apiPost("/api/documentos", { ...metadados, escola_id: idsEscolas[0], escolas_ids: idsEscolas.length > 1 ? idsEscolas : undefined, ...extra });
      };

      if (ehFormacao && parDisponivel && arquivoLista) {
        setEtapa("enviando");
        setProgresso(0);
        const envioLista = await apiUploadDireto(arquivoLista, municipioId, tipoNome, (percentual) => setProgresso(percentual));
        await registrar({
          subtipo: subtipoPar,
          drive_file_id: envioLista.drive_file_id,
          drive_file_link: envioLista.drive_file_link,
        });
      }

      if (arquivos.length > 0) {
        for (const arquivoOriginal of arquivos) {
          setEtapa("compactando");
          setProgresso(0);
          const arquivo = await comprimirVideoSeNecessario(arquivoOriginal, (p) => setProgresso(p));

          setEtapa("enviando");
          setProgresso(0);
          const uploadResult = await apiUploadDireto(arquivo, municipioId, tipoNome, (percentual) =>
            setProgresso(percentual)
          );

          await registrar({
            drive_file_id: uploadResult.drive_file_id,
            drive_file_link: uploadResult.drive_file_link,
          });
        }
      } else if (!(ehFormacao && parDisponivel && arquivoLista)) {
        await registrar({ link_externo: linkExterno });
      }

      router.push(`/municipios/${municipioId}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar documento.");
    } finally {
      setEnviando(false);
      setProgresso(null);
      setEtapa(null);
    }
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center gap-1.5 text-sm text-brand-dark/70 mb-5">
        <Link href="/" className="hover:text-brand-dark transition-colors">
          Municípios
        </Link>
        <span className="text-brand-dark/55">/</span>
        <Link href={`/municipios/${municipioId}`} className="hover:text-brand-dark transition-colors">
          {municipio?.nome ?? "Município"}
        </Link>
        <span className="text-brand-dark/55">/</span>
        <span className="text-brand-dark font-medium">Adicionar Documento</span>
      </div>

      <TituloPagina className="mb-6" descricao="Preencha as informações abaixo para inserir o documento no município.">Adicionar Documento</TituloPagina>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna principal: formulário */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white border border-black/5 shadow-sm rounded-xl px-5 py-4 flex flex-wrap items-center gap-8">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-brand-light/10 text-brand-light flex items-center justify-center shrink-0">
                <MapPinIcon className="w-4.5 h-4.5" />
              </span>
              <div>
                <label className="block text-brand-dark/70 text-xs uppercase tracking-wide mb-0.5">
                  Município *
                </label>
                <select
                  className="font-semibold text-brand-dark text-sm bg-transparent focus:outline-none cursor-pointer -ml-0.5"
                  value={municipioId}
                  onChange={(e) => setMunicipioId(e.target.value)}
                  required
                >
                  {municipios.length === 0 && <option value="">Carregando...</option>}
                  {municipios.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-brand-light/10 text-brand-light flex items-center justify-center shrink-0">
                <CalendarIcon className="w-4.5 h-4.5" />
              </span>
              <div>
                <p className="text-brand-dark/70 text-xs uppercase tracking-wide">Período (data da realização)</p>
                <p className="font-semibold text-brand-dark text-sm">
                  {dataRealizacao ? dataRealizacao.split("-").reverse().join("/") : "Informe a data abaixo"}
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="bg-white shadow-sm rounded-xl border border-black/5 p-6 space-y-5">
            {erro && (
              <div className="rounded-md bg-status-pendente/10 text-status-pendente px-4 py-2 text-sm">{erro}</div>
            )}

            <div>
              <p className="block text-sm font-medium mb-1.5 text-brand-dark/90">O que você vai enviar? *</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {([
                  ["documento", "Relatório das Formações", "PDF: relatório e lista de presença de cada formação, e o portfólio final do projeto."],
                  ["acao", "Registro de uma ação", "Vídeo ou imagem de uma ação pedagógica realizada."],
                ] as const).map(([valor, titulo, texto]) => (
                  <button
                    key={valor}
                    type="button"
                    aria-pressed={categoria === valor}
                    onClick={() => escolherCategoria(valor)}
                    className={`text-left rounded-lg border px-4 py-3 transition-colors ${categoria === valor ? "border-brand-light bg-brand-light/5 ring-2 ring-brand-light/20" : "border-black/10 hover:bg-black/[0.02]"}`}
                  >
                    <span className="block text-sm font-semibold text-brand-dark">{titulo}</span>
                    <span className="block text-xs text-brand-dark/75">{texto}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {categoria === "acao" && (
                <div>
                  <label htmlFor="acao-pedagogica" className="block text-sm font-medium mb-1.5 text-brand-dark/90">Ação pedagógica * <span className="font-normal text-brand-dark/65">(a que ação esta imagem ou vídeo pertence)</span></label>
                  <select
                    id="acao-pedagogica"
                    className="w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light"
                    value={acaoId}
                    onChange={(e) => escolherAcao(e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {acoes.filter((a) => !a.exige_pdf).map((a) => (
                      <option key={a.id} value={a.id}>{a.nome}</option>
                    ))}
                  </select>
                </div>
              )}

              {categoria === "documento" && acaoSelecionada?.subtipos?.length ? (
                <div className="col-span-2">
                  <label htmlFor="subtipo-acao" className="block text-sm font-medium mb-1.5 text-brand-dark/90">Tipo de documento *</label>
                  <select
                    id="subtipo-acao"
                    className="w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light"
                    value={subtipo}
                    onChange={(e) => setSubtipo(e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {acaoSelecionada.subtipos.map((t) => {
                      const info = acaoSelecionada.subtipos_info?.find((x) => x.nome === t);
                      const prazo = info?.prazo ? ` — até ${info.prazo.split("-").reverse().join("/")}${info.atrasado ? " (prazo vencido)" : ""}` : info ? " — sem prazo (documento final)" : "";
                      return <option key={t} value={t}>{t.replace("Relatório de Formação", "Relatório")}{prazo}</option>;
                    })}
                  </select>
                </div>
              ) : null}

              {/* Documentos são sempre PDF: o tipo já fica escolhido e a pergunta some */}
              {!exigePdf && (
              <div>
                <label className="block text-sm font-medium mb-1.5 text-brand-dark/90">Tipo de arquivo *</label>
                <select
                  className="w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light disabled:bg-black/[0.03]"
                  value={tipoId}
                  onChange={(e) => setTipoId(e.target.value)}
                  disabled={exigePdf || !categoria}
                  title={exigePdf ? "Documentos são sempre PDF" : undefined}
                  required
                >
                  <option value="">Selecione</option>
                  {tipos.filter((t) => !(apenasMidia && t.nome === "PDF")).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {!exigePdf && (
              <div>
                <label className="block text-sm font-medium mb-1.5 text-brand-dark/90">Título da atividade (opcional)</label>
                <input
                  className="w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light"
                  value={acaoEvento}
                  onChange={(e) => setAcaoEvento(e.target.value)}
                  placeholder="Ex: Roda de conversa sobre respeito"
                />
              </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1.5 text-brand-dark/90">Data de realização *</label>
                <input
                  type="date"
                  min="2000-01-01"
                  max={hojeISO()}
                  className="w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light"
                  value={dataRealizacao}
                  onChange={(e) => setDataRealizacao(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {ehFormacao ? (
                <div className="col-span-2">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="block text-sm font-medium text-brand-dark/90">Escolas do programa * <span className="font-normal text-brand-dark/70">(marque uma ou mais)</span></span>
                    {escolas.length > 0 && (
                      <button type="button" className="text-xs font-semibold text-brand-light hover:underline" onClick={() => setEscolasSel(escolasSel.length === faltam.length ? [] : faltam.map((e) => String(e.id)))}>
                        {escolasSel.length === faltam.length && faltam.length > 0 ? "Limpar" : "Marcar todas"}
                      </button>
                    )}
                  </div>
                  <div className="max-h-60 overflow-y-auto rounded-lg border border-black/10 bg-white p-3">
                    {escolas.length > 0 && jaEnviadas.length > 0 && (
                      <p className="mb-2 rounded-lg bg-[#E3F4EA] px-3 py-2 text-xs font-semibold text-[#17613B]">
                        {escolas.length - faltam.length} {escolas.length - faltam.length === 1 ? "escola já enviou" : "escolas já enviaram"} este documento e {escolas.length - faltam.length === 1 ? "saiu" : "saíram"} da lista.{faltam.length === 0 ? " Todas as escolas já enviaram!" : ""}
                      </p>
                    )}
                    {faltam.map((esc) => {
                      const enviada = false;
                      return (
                      <label key={esc.id} className={`flex items-start gap-2 rounded px-2 py-2 text-sm ${enviada ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-black/[0.03]"}`}>
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          disabled={enviada}
                          checked={escolasSel.includes(String(esc.id))}
                          onChange={(e) => setEscolasSel((atual) => (e.target.checked ? [...atual, String(esc.id)] : atual.filter((x) => x !== String(esc.id))))}
                        />
                        <span>{esc.nome}{enviada && <span className="ml-2 rounded-full bg-[#E3F4EA] px-2 py-0.5 text-[11px] font-bold text-[#17613B]">✓ já enviado</span>}</span>
                      </label>
                      );
                    })}
                    {escolas.length === 0 && <p className="p-2 text-xs text-brand-dark/70">Nenhuma escola deste município foi incluída no programa neste ciclo. Peça ao administrador para incluí-las.</p>}
                  </div>
                </div>
              ) : (
              <div>
                <label htmlFor="escola-programa" className="block text-sm font-medium mb-1.5 text-brand-dark/90">Escola do programa *</label>
                <select
                  id="escola-programa"
                  required
                  className="w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light"
                  value={escolaId}
                  onChange={(e) => setEscolaId(e.target.value)}
                >
                  <option value="">Selecione a escola</option>
                  {escolas.map((esc) => (
                    <option key={esc.id} value={esc.id}>
                      {esc.nome}
                    </option>
                  ))}
                </select>
                {escolas.length === 0 && (
                  <p className="mt-1.5 text-xs text-brand-dark/70">
                    Nenhuma escola deste município foi incluída no programa neste ciclo, então ainda não dá para enviar. Peça ao administrador para incluí-las.
                  </p>
                )}
              </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5 text-brand-dark/90">{exigePdf ? "Observação (opcional)" : "Descrição *"}</label>
              <textarea
                className="w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light"
                rows={3}
                maxLength={500}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Descreva brevemente o que o documento mostra, o local, o público, etc..."
                required
              />
              <p className="text-xs text-brand-dark/70 text-right">{descricao.length}/500</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5 text-brand-dark/90">{ehFormacao ? `${rotuloCurto(subtipo)} (PDF) *` : "Arquivos *"}</label>
              <div className="grid grid-cols-2 gap-4">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setArrastando(true);
                  }}
                  onDragLeave={() => setArrastando(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setArrastando(false);
                    if (e.dataTransfer.files?.length) adicionarArquivos(e.dataTransfer.files);
                  }}
                  className={`rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2.5 py-9 px-4 text-center transition-colors ${
                    arrastando ? "border-brand-light bg-brand-light/5" : "border-black/10 bg-black/[0.015]"
                  }`}
                >
                  <span className="w-11 h-11 rounded-full bg-brand-light/10 text-brand-light flex items-center justify-center">
                    <UploadCloudIcon className="w-5 h-5" />
                  </span>
                  <p className="text-sm text-brand-dark/85">Arraste e solte os arquivos aqui</p>
                  <p className="text-xs text-brand-dark/65">ou</p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark transition-colors"
                  >
                    <FolderIcon className="w-4 h-4" /> Selecionar arquivos
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple={!ehFormacao}
                    accept={exigePdf ? FORMATOS_PDF : apenasMidia ? FORMATOS_MIDIA : FORMATOS_ACEITOS}
                    onChange={(e) => e.target.files && adicionarArquivos(e.target.files)}
                    className="hidden"
                  />
                  <p className="text-xs text-brand-dark/65 mt-1">
                    {exigePdf ? "Formato aceito: PDF" : apenasMidia ? "Formatos aceitos: JPG, PNG, HEIC, MP4" : "Formatos aceitos: JPG, PNG, HEIC, MP4, PDF"} (máx. {MAX_FILE_MB}MB por arquivo — vídeos acima de 10MB são compactados automaticamente)
                  </p>
                </div>

                <div className="rounded-xl border border-black/10 p-3.5 flex flex-col">
                  <p className="text-xs font-medium text-brand-dark/80 mb-2.5">
                    Arquivos selecionados ({arquivos.length})
                  </p>
                  {arquivos.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center text-brand-dark/65 py-6 gap-1.5">
                      <PaperclipIcon className="w-5 h-5" />
                      <p className="text-xs">Nenhum arquivo selecionado</p>
                    </div>
                  ) : (
                    <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                      {arquivos.map((f, i) => (
                        <li
                          key={`${f.name}-${i}`}
                          className="flex items-center gap-2 bg-brand-light/5 rounded-lg px-2.5 py-2 text-xs"
                        >
                          <PaperclipIcon className="w-3.5 h-3.5 text-brand-light shrink-0" />
                          <span className="truncate flex-1">{f.name}</span>
                          <span className="text-brand-dark/70 shrink-0">{formatBytes(f.size)}</span>
                          <button
                            type="button"
                            onClick={() => removerArquivo(i)}
                            className="text-brand-dark/60 hover:text-status-pendente shrink-0 transition-colors"
                            aria-label="Remover arquivo"
                            title="Remover arquivo"
                          >
                            <XIcon className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {ehFormacao && parDisponivel && (
              <div>
                <label htmlFor="arquivo-par" className="block text-sm font-medium mb-1.5 text-brand-dark/90">Também enviar: {rotuloCurto(subtipoPar)} (PDF, opcional)</label>
                <input
                  id="arquivo-par"
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setArquivoLista(e.target.files?.[0] ?? null)}
                  className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm bg-white"
                />
                <p className="mt-1 text-xs text-brand-dark/70">Se quiser, anexe aqui o outro documento da mesma formação. Os dois vão no mesmo envio, cada um com o seu nome.</p>
              </div>
            )}

            {/* vídeo grande por link: só para registro de ação (documento é sempre PDF) */}
            {!exigePdf && (
            <div>
              <label className="block text-sm font-medium mb-1.5 text-brand-dark/90">Vídeo grande? Cole o link aqui (opcional)</label>
              <div className="relative">
                <LinkIcon className="w-4 h-4 text-brand-dark/60 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  className="w-full border border-black/10 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light"
                  value={linkExterno}
                  onChange={(e) => setLinkExterno(e.target.value)}
                  placeholder="Cole o link do YouTube, Google Drive ou Instagram"
                />
              </div>
              <PreviaDoLink link={linkExterno} />
              <details className="mt-2 text-xs text-brand-dark/80">
                <summary className="cursor-pointer font-semibold text-brand-light">Como deixar o link funcionando?</summary>
                <ul className="mt-1.5 list-disc space-y-1 pl-5">
                  <li><strong>YouTube:</strong> deixe o vídeo como &quot;Público&quot; ou &quot;Não listado&quot;.</li>
                  <li><strong>Google Drive:</strong> clique em Compartilhar e, em &quot;Acesso geral&quot;, escolha &quot;Qualquer pessoa com o link&quot;.</li>
                  <li><strong>Instagram:</strong> use o link do post ou do reel (botão &quot;Copiar link&quot;), e o perfil precisa ser público.</li>
                  <li>Fotos e vídeos curtos podem ser enviados direto pelo botão de arquivo.</li>
                </ul>
              </details>
            </div>
            )}

            <div className="rounded-lg bg-brand-light/10 text-brand-dark/85 text-xs px-4 py-3">
              Após o envio, o documento ficará disponível na aba correspondente deste município, com status{" "}
              <strong>pendente</strong> até ser validado pela administração.
            </div>

            {enviando && progresso !== null && (
              <div>
                <div className="h-1.5 bg-black/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-light transition-all"
                    style={{ width: `${progresso}%` }}
                  />
                </div>
                <p className="text-xs text-brand-dark/75 mt-1">
                  {etapa === "compactando"
                    ? `Preparando vídeo para o Drive... ${progresso}% — vídeos longos podem levar alguns minutos, não feche esta página.`
                    : `Enviando arquivo... ${progresso}%`}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Link
                href={`/municipios/${municipioId}`}
                className="px-4 py-2.5 rounded-lg border border-black/10 text-sm font-medium hover:bg-black/[0.02] transition-colors"
              >
                Cancelar
              </Link>
              <button
                type="submit"
                disabled={enviando}
                className="px-5 py-2.5 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark transition-colors disabled:opacity-50"
              >
                {enviando ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        </div>

        {/* Coluna lateral: apoio */}
        <div className="space-y-5">
          <div className="bg-white shadow-sm rounded-xl border border-black/5 p-5">
            <h2 className="text-sm font-semibold text-brand-dark mb-1">Tipos de arquivo e suas finalidades</h2>
            <p className="text-xs text-brand-dark/70 mb-4 leading-snug">
              Veja abaixo o que cada tipo de documento representa e qual a sua finalidade.
            </p>
            <div className="space-y-1">
              {tipos.map((t) => {
                const info = INFO_TIPOS[t.nome] ?? INFO_TIPOS["Outros"];
                const ativo = tipoSelecionado === t.nome;
                const { Icone } = info;
                return (
                  <div
                    key={t.id}
                    className={`flex items-start gap-3 rounded-lg p-2.5 transition-colors ${
                      ativo ? "bg-brand-light/5 ring-1 ring-brand-light/25" : "hover:bg-black/[0.015]"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${info.cor}`}>
                      <Icone className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="text-sm font-medium text-brand-dark">{t.nome}</p>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${info.badge}`}>
                          Finalidade
                        </span>
                      </div>
                      <p className="text-xs text-brand-dark/80 leading-snug">{info.finalidade}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-brand-light/[0.06] border border-brand-light/15 rounded-xl p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-dark mb-3">
              <LightbulbIcon className="w-4.5 h-4.5 text-brand-light" /> Dicas importantes
            </h2>
            <ul className="space-y-2.5">
              {DICAS.map((dica) => (
                <li key={dica} className="flex gap-2 text-xs text-brand-dark/85 leading-snug">
                  <CheckIcon className="w-3.5 h-3.5 text-brand-light shrink-0 mt-0.5" />
                  {dica}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
