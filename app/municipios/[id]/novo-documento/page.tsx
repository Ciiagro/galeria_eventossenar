"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiGet, apiPost, apiUploadDireto, Escola, Municipio, Projeto, TipoDocumento } from "@/lib/api";
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

const MAX_FILE_MB = 500;
const FORMATOS_ACEITOS = ".jpg,.jpeg,.png,.heic,.pdf,.mp4,.mov";

// Info fixa de apoio: o que cada tipo de arquivo representa e sua finalidade.
// Casamento é feito pelo nome do tipo vindo do banco (tabela tipos_documento).
const INFO_TIPOS: Record<
  string,
  { Icone: (p: { className?: string }) => JSX.Element; cor: string; finalidade: string; badge: string }
> = {
  "Imagens": {
    Icone: ImageIcon,
    cor: "bg-blue-50 text-blue-600",
    badge: "bg-blue-50 text-blue-700",
    finalidade: "Comprovação visual das ações realizadas.",
  },
  "Relatório das Ações": {
    Icone: FileTextIcon,
    cor: "bg-emerald-50 text-emerald-600",
    badge: "bg-emerald-50 text-emerald-700",
    finalidade: "Comprovar a execução das ações.",
  },
  "Lista de Presença": {
    Icone: ClipboardListIcon,
    cor: "bg-amber-50 text-amber-600",
    badge: "bg-amber-50 text-amber-700",
    finalidade: "Comprovar a participação dos beneficiários.",
  },
  "Vídeos": {
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

const DICAS = [
  "No campo \"Ação/Evento\", selecione uma ação para facilitar a organização.",
  "Use descrições claras e objetivas.",
  "Prefira salvar os arquivos em boa qualidade.",
  "Em caso de vídeos grandes, utilize o link do Google Drive, YouTube ou outra plataforma.",
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
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [escolas, setEscolas] = useState<Escola[]>([]);

  const [tipoId, setTipoId] = useState("");
  const [projetoId, setProjetoId] = useState("");
  const [acaoEvento, setAcaoEvento] = useState("");
  const [escolaId, setEscolaId] = useState("");
  const [dataRealizacao, setDataRealizacao] = useState("");
  const [descricao, setDescricao] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [linkExterno, setLinkExterno] = useState("");
  const [arrastando, setArrastando] = useState(false);

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
    apiGet("/api/projetos")
      .then((p) => {
        console.log("[projetos] OK, veio:", p);
        setProjetos(p);
      })
      .catch((e) => {
        console.error("[projetos] ERRO:", e);
        setErro(e instanceof Error ? `Não foi possível carregar os projetos: ${e.message}` : "Não foi possível carregar os projetos.");
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
    apiGet(`/api/escolas?municipio_id=${municipioId}`).then(setEscolas).catch(() => null);
    setEscolaId("");
  }, [municipioId]);

  const municipio = useMemo(
    () => municipios.find((m) => String(m.id) === String(municipioId)) ?? null,
    [municipios, municipioId]
  );
  const tipoSelecionado = useMemo(() => tipos.find((t) => t.id === tipoId)?.nome, [tipos, tipoId]);

  function adicionarArquivos(lista: FileList | File[]) {
    const todos = Array.from(lista);
    const novos = todos.filter((f) => f.size <= MAX_FILE_MB * 1024 * 1024);
    const grandes = todos.length - novos.length;
    setArquivos((atual) => [...atual, ...novos]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setErro(grandes > 0 ? `${grandes} arquivo(s) ignorado(s) por passar de ${MAX_FILE_MB}MB.` : null);
  }

  function removerArquivo(index: number) {
    setArquivos((atual) => atual.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (!municipioId || !tipoId || !dataRealizacao || !descricao) {
      setErro("Preencha os campos obrigatórios.");
      return;
    }
    if (arquivos.length === 0 && !linkExterno) {
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
        escola_id: escolaId || undefined,
        projeto_id: projetoId || undefined,
        descricao,
        data_realizacao: dataRealizacao,
      };

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

          await apiPost("/api/documentos", {
            ...metadados,
            drive_file_id: uploadResult.drive_file_id,
            drive_file_link: uploadResult.drive_file_link,
          });
        }
      } else {
        await apiPost("/api/documentos", { ...metadados, link_externo: linkExterno });
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

      <div className="flex items-start gap-4 mb-7">
        <div className="w-12 h-12 rounded-xl bg-brand-light/10 text-brand-light flex items-center justify-center shrink-0">
          <UploadCloudIcon className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-brand-dark leading-tight">Adicionar Documento</h1>
          <p className="text-sm text-brand-dark/80 mt-0.5">
            Preencha as informações abaixo para inserir o documento no município.
          </p>
        </div>
      </div>

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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-brand-dark/90">Programa</label>
                <select
                  className="w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light"
                  value={projetoId}
                  onChange={(e) => setProjetoId(e.target.value)}
                >
                  <option value="">Nenhum / não se aplica</option>
                  {projetos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-brand-dark/90">Tipo de arquivo *</label>
                <select
                  className="w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light"
                  value={tipoId}
                  onChange={(e) => setTipoId(e.target.value)}
                  required
                >
                  <option value="">Selecione</option>
                  {tipos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-brand-dark/90">Ação / Evento</label>
                <input
                  className="w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light"
                  value={acaoEvento}
                  onChange={(e) => setAcaoEvento(e.target.value)}
                  placeholder="Selecione ou digite a ação/evento"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-brand-dark/90">Data de realização *</label>
                <input
                  type="date"
                  min="2000-01-01"
                  max={`${new Date().getFullYear() + 1}-12-31`}
                  className="w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light"
                  value={dataRealizacao}
                  onChange={(e) => setDataRealizacao(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-brand-dark/90">Escola (opcional)</label>
                <select
                  className="w-full border border-black/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light"
                  value={escolaId}
                  onChange={(e) => setEscolaId(e.target.value)}
                >
                  <option value="">Nenhuma / não se aplica</option>
                  {escolas.map((esc) => (
                    <option key={esc.id} value={esc.id}>
                      {esc.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5 text-brand-dark/90">Descrição *</label>
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
              <label className="block text-sm font-medium mb-1.5 text-brand-dark/90">Arquivos *</label>
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
                    multiple
                    accept={FORMATOS_ACEITOS}
                    onChange={(e) => e.target.files && adicionarArquivos(e.target.files)}
                    className="hidden"
                  />
                  <p className="text-xs text-brand-dark/65 mt-1">
                    Formatos aceitos: JPG, PNG, HEIC, MP4, PDF (máx. {MAX_FILE_MB}MB por arquivo — vídeos acima de 10MB são compactados automaticamente)
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

            <div>
              <label className="block text-sm font-medium mb-1.5 text-brand-dark/90">Link alternativo (opcional)</label>
              <div className="relative">
                <LinkIcon className="w-4 h-4 text-brand-dark/60 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  className="w-full border border-black/10 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light"
                  value={linkExterno}
                  onChange={(e) => setLinkExterno(e.target.value)}
                  placeholder="Ex.: Link do Google Drive, Google Fotos, YouTube, etc."
                />
              </div>
            </div>

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
