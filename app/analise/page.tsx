"use client";

import { TituloPagina, Indicador } from "@/components/TituloPagina";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, Documento, Municipio } from "@/lib/api";
import { usePerfil } from "@/lib/usePerfil";
import { normalizarLink } from "@/lib/linkIncorporavel";
import PreviewLink from "@/components/PreviewLink";
import { AnaliseBadge } from "@/components/AnaliseBadge";
import { AlertIcon, CalendarIcon, CheckIcon, FolderIcon, MapPinIcon, UserIcon, XIcon } from "@/components/icons";
import { EscolaIcon, Info, Miniatura } from "@/components/DocumentoUI";
import { Abas, BarraFiltros, CampoBusca, CLASSE_SELECT, SeletorOrdem } from "@/components/Filtros";
import { MESES } from "@/lib/periodo";

type Aba = "para_analisar" | "analisados" | "arquivados" | "todos";
type Ordem = "data_acao" | "recentes" | "antigos";

// Mesma altura e formato nos três botões de ação
const BOTAO = "inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition disabled:opacity-50";

function semAcento(texto?: string | null) {
  return (texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function formatarData(data?: string | null) {
  if (!data) return "";
  const [ano, mes, dia] = data.slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : data;
}

// Análise prévia: o Apoiador de Relatórios confere os documentos e as imagens e
// recomenda aprovar ou pede ajustes. A decisão final continua sendo do administrador.
export default function AnalisePage() {
  const { perfil, carregando } = usePerfil();
  const router = useRouter();
  const permitido = perfil?.role === "apoiador_relatorios" || perfil?.role === "admin";

  useEffect(() => {
    if (!carregando && !permitido) router.replace("/");
  }, [carregando, permitido, router]);

  if (carregando || !permitido) return null;
  return <FilaAnalise />;
}

function FilaAnalise() {
  const [documentos, setDocumentos] = useState<Documento[] | null>(null);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("para_analisar");
  const [filtroMunicipio, setFiltroMunicipio] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroMes, setFiltroMes] = useState("");
  const [filtroAno, setFiltroAno] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("data_acao"); // padrão: data de realização, da mais recente para a mais antiga
  const [visualizando, setVisualizando] = useState<Documento | null>(null);
  const [ajustesId, setAjustesId] = useState<string | null>(null);
  const [alterandoId, setAlterandoId] = useState<string | null>(null); // documento já analisado cujo parecer está sendo mudado
  const [observacao, setObservacao] = useState("");
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  const carregar = useCallback(() => {
    return apiGet("/api/documentos?fila_analise=1")
      .then((lista: Documento[]) => {
        setDocumentos(lista);
        setErro(null);
      })
      .catch((e) => setErro(e.message));
  }, []);

  useEffect(() => {
    carregar();
    apiGet("/api/municipios").then(setMunicipios).catch(() => null);
  }, [carregar]);

  // Documentos novos chegam sem precisar recarregar a página: confere a cada 30 s e ao voltar para a aba
  useEffect(() => {
    function atualizar() {
      if (document.hidden || ajustesId) return; // não mexe enquanto escreve um pedido de ajustes
      carregar();
    }
    const intervalo = window.setInterval(atualizar, 30000);
    window.addEventListener("focus", atualizar);
    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener("focus", atualizar);
    };
  }, [carregar, ajustesId]);

  const nomeMunicipio = useMemo(() => new Map(municipios.map((m) => [m.id, m.nome])), [municipios]);

  // anos que existem nos documentos (pela data da realização), para o filtro de ano
  const anos = useMemo(
    () => Array.from(new Set((documentos ?? []).map((d) => (d.data_realizacao ?? "").slice(0, 4)).filter(Boolean))).sort().reverse(),
    [documentos]
  );

  // busca + município + mês + ano valem para a lista e para a contagem de cada aba
  const doFiltro = useMemo(() => {
    const termo = semAcento(busca.trim());
    return (documentos ?? []).filter((d) => {
      if (filtroMunicipio && String(d.municipio_id) !== filtroMunicipio) return false;
      const data = d.data_realizacao ?? "";
      if (filtroAno && data.slice(0, 4) !== filtroAno) return false;
      if (filtroMes && Number(data.slice(5, 7)) !== Number(filtroMes)) return false;
      if (!termo) return true;
      return [d.acao_evento, d.descricao, d.responsavel_nome, d.escolas?.nome, d.acoes_pedagogicas?.nome, nomeMunicipio.get(d.municipio_id)]
        .some((campo) => semAcento(campo).includes(termo));
    });
  }, [documentos, filtroMunicipio, filtroMes, filtroAno, busca, nomeMunicipio]);

  const contagem = useMemo(() => {
    const ativos = doFiltro.filter((d) => !d.arquivado);
    const analisados = ativos.filter((d) => d.analise_status).length;
    return { para_analisar: ativos.length - analisados, analisados, arquivados: doFiltro.length - ativos.length, todos: ativos.length };
  }, [doFiltro]);

  // o número do cabeçalho não muda com os filtros: é tudo o que está esperando análise
  const totalParaAnalisar = useMemo(
    () => (documentos ?? []).filter((d) => !d.arquivado && !d.analise_status).length,
    [documentos]
  );

  const visiveis = useMemo(() => {
    const itens = doFiltro.filter((d) => {
      if (aba === "arquivados") return Boolean(d.arquivado);
      if (d.arquivado) return false;
      if (aba === "para_analisar") return !d.analise_status;
      if (aba === "analisados") return Boolean(d.analise_status);
      return true;
    });
    // ordem cronológica decrescente: pela data da ação (empate: o que foi enviado por último primeiro)
    const dataAcao = (d: Documento) => d.data_realizacao ?? "";
    const envio = (d: Documento) => d.created_at ?? "";
    return [...itens].sort((a, b) => {
      if (ordem === "recentes") return envio(b).localeCompare(envio(a));
      if (ordem === "antigos") return envio(a).localeCompare(envio(b));
      return dataAcao(b).localeCompare(dataAcao(a)) || envio(b).localeCompare(envio(a));
    });
  }, [doFiltro, aba, ordem]);

  async function arquivar(doc: Documento, valor: boolean) {
    setSalvandoId(doc.id);
    setErro(null);
    try {
      await apiPost("/api/analise/arquivar", { documento_id: doc.id, arquivado: valor });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível arquivar.");
    } finally {
      setSalvandoId(null);
    }
  }

  async function enviarAnalise(doc: Documento, status: "recomendado" | "ajustes", obs = "") {
    setSalvandoId(doc.id);
    setErro(null);
    try {
      await apiPost("/api/analisar", { documento_id: doc.id, analise_status: status, analise_obs: obs });
      setAjustesId(null);
      setAlterandoId(null);
      setObservacao("");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar a análise.");
    } finally {
      setSalvandoId(null);
    }
  }

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm sm:p-7">
        <TituloPagina
          descricao="Confira os documentos e os registros das ações (imagens e vídeos). Recomende a aprovação ou peça ajustes: o administrador faz a validação final com a sua análise."
          acao={<Indicador valor={totalParaAnalisar} rotulo="para analisar" alerta={totalParaAnalisar > 0} />}
        >Análise de documentos</TituloPagina>

        {erro && <div className="mt-4 rounded-lg bg-status-pendente/10 px-4 py-3 text-sm text-status-pendente" role="alert">{erro}</div>}

        <Abas<Aba>
          abas={[
            { valor: "para_analisar", rotulo: "Para analisar", contagem: contagem.para_analisar },
            { valor: "analisados", rotulo: "Já analisados", contagem: contagem.analisados },
            { valor: "arquivados", rotulo: "Arquivados", contagem: contagem.arquivados },
            { valor: "todos", rotulo: "Todos", contagem: contagem.todos },
          ]}
          valor={aba}
          onChange={setAba}
          direita={
            <SeletorOrdem
              valor={ordem}
              onChange={(v) => setOrdem(v as Ordem)}
              opcoes={[["data_acao", "Data da ação (mais recente)"], ["recentes", "Enviados mais recentes"], ["antigos", "Enviados mais antigos"]]}
            />
          }
        />

        <BarraFiltros
          colunas="grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1.3fr_1fr_0.8fr]"
          mostrarLimpar={Boolean(filtroMunicipio || filtroMes || filtroAno || busca.trim())}
          onLimpar={() => { setFiltroMunicipio(""); setFiltroMes(""); setFiltroAno(""); setBusca(""); }}
        >
          <CampoBusca value={busca} onChange={setBusca} placeholder="Buscar escola, ação pedagógica, município..." />
          <select value={filtroMunicipio} onChange={(e) => setFiltroMunicipio(e.target.value)} className={CLASSE_SELECT} aria-label="Município">
            <option value="">Todos os municípios</option>
            {municipios.map((m) => (
              <option key={m.id} value={m.id}>{m.nome}</option>
            ))}
          </select>
          <select value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} className={CLASSE_SELECT} aria-label="Mês">
            <option value="">Todos os meses</option>
            {MESES.map((mes, i) => <option key={mes} value={String(i + 1)}>{mes}</option>)}
          </select>
          <select value={filtroAno} onChange={(e) => setFiltroAno(e.target.value)} className={CLASSE_SELECT} aria-label="Ano">
            <option value="">Todos os anos</option>
            {anos.map((ano) => <option key={ano} value={ano}>{ano}</option>)}
          </select>
        </BarraFiltros>

        <div className="mt-5 space-y-3">
          {!documentos && !erro && <p className="text-sm text-brand-dark/75">Carregando...</p>}
          {documentos && visiveis.length === 0 && (
            <div className="rounded-xl border border-dashed border-black/10 p-8 text-center text-sm text-brand-dark/75">
              {aba === "para_analisar" && !busca.trim() && !filtroMunicipio && !filtroMes && !filtroAno
                ? "🎉 Nada para analisar agora."
                : "Nenhum documento encontrado com esses filtros."}
            </div>
          )}

          {visiveis.map((doc) => (
            <CartaoAnalise
              key={doc.id}
              doc={doc}
              municipio={nomeMunicipio.get(doc.municipio_id) ?? `Município ${doc.municipio_id}`}
              salvando={salvandoId === doc.id}
              abrindoAjustes={ajustesId === doc.id}
              alterando={alterandoId === doc.id}
              onAlterar={() => setAlterandoId(doc.id)}
              onCancelarAlterar={() => { setAlterandoId(null); setAjustesId(null); }}
              observacao={observacao}
              onObservacao={setObservacao}
              onVisualizar={() => setVisualizando(doc)}
              onRecomendar={() => enviarAnalise(doc, "recomendado")}
              onPedirAjustes={() => { setAjustesId(doc.id); setObservacao(doc.analise_status === "ajustes" ? doc.analise_obs ?? "" : ""); }}
              onEnviarAjustes={() => enviarAnalise(doc, "ajustes", observacao)}
              onCancelarAjustes={() => setAjustesId(null)}
              onArquivar={(valor) => arquivar(doc, valor)}
            />
          ))}
        </div>
      </div>

      {/* Visualização grande */}
      {visualizando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark/40 p-4" role="dialog" aria-modal="true" onClick={() => setVisualizando(null)}>
          <div className="w-full max-w-4xl rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="truncate font-semibold text-brand-dark">
                {visualizando.tipos_documento?.nome} — {visualizando.acao_evento ?? "Sem ação/evento"}
              </p>
              <div className="flex shrink-0 items-center gap-3">
                <a href={normalizarLink(visualizando.drive_file_link ?? visualizando.link_externo) ?? undefined} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-light hover:underline">
                  Abrir em nova aba
                </a>
                <button onClick={() => setVisualizando(null)} className="rounded p-1 hover:bg-black/5" aria-label="Fechar">
                  <XIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
            <PreviewLink
              link={visualizando.drive_file_link ?? visualizando.link_externo}
              className="h-[70vh] w-full"
              fallback={<p className="text-sm text-brand-dark/75">Este link não pode ser exibido aqui. Use &quot;Abrir em nova aba&quot;.</p>}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================
// Cartão de um documento: mesmo desenho da tela de Documentos do coordenador
// (miniatura à esquerda, título, informações e descrição), com as ações da análise à direita
// ================================================================
function CartaoAnalise({
  doc, municipio, salvando, abrindoAjustes, alterando, onAlterar, onCancelarAlterar, observacao, onObservacao,
  onVisualizar, onRecomendar, onPedirAjustes, onEnviarAjustes, onCancelarAjustes, onArquivar,
}: {
  doc: Documento;
  municipio: string;
  salvando: boolean;
  abrindoAjustes: boolean;
  alterando: boolean;
  onAlterar: () => void;
  onCancelarAlterar: () => void;
  observacao: string;
  onObservacao: (texto: string) => void;
  onVisualizar: () => void;
  onRecomendar: () => void;
  onPedirAjustes: () => void;
  onEnviarAjustes: () => void;
  onCancelarAjustes: () => void;
  onArquivar: (valor: boolean) => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const descricao = doc.descricao ?? "";
  const longa = descricao.length > 180;
  const temArquivo = Boolean(doc.drive_file_link || doc.link_externo);
  // Já analisado: os botões de parecer ficam fechados; "Alterar análise" abre de novo, de propósito
  const travado = Boolean(doc.analise_status) && !alterando;

  return (
    <article className="rounded-xl border border-black/5 bg-white p-3 transition-shadow hover:shadow-sm sm:p-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <Miniatura doc={doc} onClick={temArquivo ? onVisualizar : undefined} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-bold leading-snug text-brand-dark">
                {doc.tipos_documento?.nome ?? "Documento"}
                {doc.acao_evento && <span className="font-semibold text-brand-dark/85"> — {doc.acao_evento}</span>}
              </h2>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-brand-dark/80">
                <Info icone={MapPinIcon} texto={municipio} forte />
                {doc.escolas?.nome && <Info icone={EscolaIcon} texto={doc.escolas.nome} forte />}
                {doc.acoes_pedagogicas?.nome && <Info icone={FolderIcon} texto={`${doc.acoes_pedagogicas.nome}${doc.subtipo ? ` · ${doc.subtipo}` : ""}`} forte />}
                <Info icone={CalendarIcon} texto={`Realizado em ${formatarData(doc.data_realizacao)}`} />
                {doc.responsavel_nome && <Info icone={UserIcon} texto={`Enviado por ${doc.responsavel_nome}`} />}
              </div>
            </div>

            {!abrindoAjustes && (
              <div className="flex shrink-0 flex-wrap gap-2">
                {doc.arquivado ? (
                  <button onClick={() => onArquivar(false)} disabled={salvando} className={`${BOTAO} bg-black/5 text-brand-dark hover:bg-black/10`}>
                    <FolderIcon className="h-4 w-4" /> Desarquivar
                  </button>
                ) : travado ? (
                  <>
                    <button onClick={onAlterar} disabled={salvando} title="Mudar o parecer enquanto o administrador ainda não decidiu"
                      className={`${BOTAO} bg-black/5 text-brand-dark hover:bg-black/10`}>
                      Alterar análise
                    </button>
                    <button onClick={() => onArquivar(true)} disabled={salvando} title="Tirar da fila. Dá para desarquivar na aba Arquivados."
                      className={`${BOTAO} bg-black/5 text-brand-dark/85 hover:bg-black/10`}>
                      <FolderIcon className="h-4 w-4" /> Arquivar
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={onRecomendar} disabled={salvando || doc.analise_status === "recomendado"}
                      title={doc.analise_status === "recomendado" ? "Já está como recomendado" : "Recomendar ao administrador que aprove este documento"}
                      className={`${BOTAO} bg-[#2F9E62] text-white shadow-sm hover:brightness-110`}>
                      <CheckIcon className="h-4 w-4" /> Recomendar
                    </button>
                    <button onClick={onPedirAjustes} disabled={salvando} title="Explicar o que precisa ser corrigido antes de aprovar"
                      className={`${BOTAO} bg-[#FFF3CC] text-[#6E4B00] hover:bg-[#FFE9A6]`}>
                      <AlertIcon className="h-4 w-4" /> Pedir ajustes
                    </button>
                    {alterando ? (
                      <button onClick={onCancelarAlterar} disabled={salvando} className={`${BOTAO} text-brand-dark/80 hover:bg-black/5`}>
                        <XIcon className="h-4 w-4" /> Cancelar
                      </button>
                    ) : (
                      <button onClick={() => onArquivar(true)} disabled={salvando} title="Tirar da fila (duplicado, enviado por engano...). Dá para desarquivar na aba Arquivados."
                        className={`${BOTAO} bg-black/5 text-brand-dark/85 hover:bg-black/10`}>
                        <FolderIcon className="h-4 w-4" /> Arquivar
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {descricao && (
            <p className={`mt-2 whitespace-pre-line text-sm text-brand-dark/85 ${!expandido && longa ? "line-clamp-2" : ""}`}>{descricao}</p>
          )}
          {longa && (
            <button onClick={() => setExpandido((v) => !v)} className="mt-1 text-sm font-semibold text-brand-light hover:underline">
              {expandido ? "ver menos" : "ver mais"}
            </button>
          )}

          <AnaliseBadge doc={doc} />

          {abrindoAjustes && (
            <div className="mt-3 rounded-xl border border-[#F2B705]/50 bg-[#FFF8E1] p-3">
              <label htmlFor={`obs-${doc.id}`} className="block text-sm font-bold text-[#6E4B00]">O que precisa ser ajustado?</label>
              <textarea
                id={`obs-${doc.id}`}
                value={observacao}
                onChange={(e) => onObservacao(e.target.value)}
                rows={3}
                maxLength={1000}
                autoFocus
                placeholder="Ex.: A imagem está escura; envie outra. O relatório não cita a escola."
                className="mt-1.5 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F2B705]/40"
              />
              <div className="mt-2 flex gap-2">
                <button onClick={onEnviarAjustes} disabled={salvando || !observacao.trim()}
                  className="rounded-lg bg-[#F26122] px-4 py-2 text-sm font-bold text-white shadow-sm hover:brightness-110 disabled:opacity-50">
                  {salvando ? "Salvando..." : "Enviar análise"}
                </button>
                <button onClick={onCancelarAjustes} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-brand-dark/80 hover:bg-black/5">
                  <XIcon className="h-4 w-4" /> Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
