"use client";

import { useEffect, useState, type ReactNode } from "react";
import CabecalhoPublico from "@/components/CabecalhoPublico";
import { FundoFestivo, LogoValores } from "@/components/Sol";
import { Arvore, CriancasPulando, Escolinha, Flor, Grama, Nuvem } from "@/components/Desenhos";
import PreviewLink from "@/components/PreviewLink";
import { BookOpenIcon, BuildingIcon, HeartIcon, LightbulbIcon, UserIcon } from "@/components/icons";
import { apiGetCache, DocumentoGaleria } from "@/lib/api";
import { idDoDrive, urlsMiniatura } from "@/lib/miniatura";
import { FAIXAS, VALORES, type ValorProjeto } from "@/lib/valoresProjeto";
import { VIDEOS_PROJETO, type VideoProjeto } from "@/lib/videosProjeto";

// Página pública que apresenta o projeto e os valores humanos (textos dos slides da apresentação).
// Visual delicado: fundos em tons claros das cores dos slides, com a cor forte só nos detalhes.

const OBJETIVO_GERAL =
  "Desenvolver princípios e valores em crianças, por meio da capacitação de educadores, promovendo o incremento de competências socioemocionais e a formação integral, para que elas se tornem agentes de transformação, de modo que o programa contribua para a melhoria da qualidade de vida e para a valorização do meio rural.";

const OBJETIVOS_ESPECIFICOS = [
  "Desenvolver valores humanos essenciais para a formação do caráter.",
  "Promover a convivência harmoniosa e o respeito mútuo na comunidade escolar (educadores, crianças e suas famílias) para se tornarem agentes de transformação social.",
  "Incentivar a prática do bem e a tomada de decisões conscientes, alinhada às competências gerais da BNCC, favorecendo uma formação ampla e contextualizada.",
  "Criar um ambiente mais acolhedor e humano nas escolas, capacitando educadores para aplicar uma formação integral.",
];

// Premissas do projeto, com as cores do quadro original
const PREMISSAS: { texto: string; cor: string }[] = [
  { texto: "Valorização do protagonismo infantil, com o professor como mediador das vivências.", cor: "#E2EFD9" },
  { texto: "Transversalidade dos valores, integrando-os a todas as áreas do conhecimento.", cor: "#FFE599" },
  { texto: "Respeito à diversidade cultural, étnica e social do público atendido, incluindo parceiros.", cor: "#DEEAF6" },
  { texto: "Compromisso com a formação continuada e com o envolvimento familiar.", cor: "#FFE599" },
  { texto: "Adoção de avaliação processual, registrando progressos práticos e mudanças no clima escolar.", cor: "#DEEAF6" },
  { texto: "O reconhecimento do SENAR como instituição nacional de referência na formação profissional e social.", cor: "#A8D08D" },
];

const PARCEIROS = [
  { papel: "Referência", nome: "AFCC" },
  { papel: "Apoio", nome: "Sítio Barreiras" },
  { papel: "Mantenedora da metodologia", nome: "Associação Douglas Andreani (ADA)" },
];

const ATALHOS = [
  ["#valores", "Valores"],
  ["#premissas", "Premissas"],
  ["#objetivos", "Objetivos"],
  ["#metodologia", "Metodologia"],
  ["#videos", "Vídeos"],
];

// tom bem claro de uma cor, para fundos delicados
const tom = (cor: string, forca = 14) => `color-mix(in srgb, ${cor} ${forca}%, #ffffff)`;

export default function SobreProjetoPage() {
  const valor = (nome: string) => VALORES.find((v) => v.nome === nome)!;
  const [assistindo, setAssistindo] = useState<VideoProjeto | null>(null);
  const [fotos, setFotos] = useState<DocumentoGaleria[]>([]);

  // Fotos recentes já publicadas na galeria (some se não houver)
  useEffect(() => {
    apiGetCache("/api/galeria?ciclo_id=ativo")
      .then((lista: DocumentoGaleria[]) => {
        const imagens = lista
          .filter((d) => !/v[ií]deo/i.test(d.tipos_documento?.nome ?? "") && urlsMiniatura(d).length > 0)
          .sort((a, b) => `${b.data_realizacao ?? ""}`.localeCompare(`${a.data_realizacao ?? ""}`))
          .slice(0, 6);
        setFotos(imagens);
      })
      .catch(() => null);
  }, []);

  return (
    <div className="min-h-screen bg-[#f3f7f2] text-brand-dark">
      <CabecalhoPublico ativo="projeto" />

      <main className="mx-auto max-w-[1400px] space-y-4 px-4 py-4 sm:px-8">
        {/* ================= Abertura: logo e sol lado a lado, texto ao lado (ocupa pouca altura) ================= */}
        <FundoFestivo className="rounded-2xl border border-black/5" mostrarSol={false}>
          <section className="px-5 py-4 sm:px-8 sm:py-5">
            {/* no computador: logo rente à esquerda | texto no meio | sol rente à direita (como na galeria) */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 lg:flex-nowrap">
              <LogoValores className="order-1 w-36 shrink-0 sm:w-44" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/sol-valores.png" alt="" width={900} height={545} className="order-2 ml-auto h-auto w-24 shrink-0 sm:w-32 lg:order-3 lg:w-44" />

              <div className="order-3 w-full lg:order-2 lg:w-auto lg:min-w-0 lg:flex-1 lg:pl-4 lg:pr-12">
                <h1 className="text-2xl font-extrabold leading-tight sm:text-3xl">
                  O que é o <span className="bg-[linear-gradient(transparent_65%,#81B61E66_65%)] px-0.5">Projeto Valores</span>
                </h1>
                <p className="mt-2 max-w-4xl text-sm leading-relaxed text-brand-dark/90 sm:text-base">
                  Uma iniciativa do <strong>SENAR Ceará</strong> em parceria com a Federação da Agricultura e Pecuária do Estado do Ceará (<strong>FAEC</strong>) e
                  prefeituras municipais, que complementa a Educação Infantil com uma metodologia de ações pedagógicas em valores humanos. Busca formar o caráter
                  e promover a convivência harmoniosa na comunidade escolar, impactando positivamente a vida das crianças e de suas famílias.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <a href="#videos" className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-light">
                    <span aria-hidden="true">▶</span> Assistir aos vídeos
                  </a>
                  <a href="/galeria" className="inline-flex items-center gap-1.5 rounded-lg border border-brand/60 bg-white/80 px-5 py-2.5 text-sm font-bold text-brand transition hover:bg-white">
                    Ver a galeria <span aria-hidden="true">›</span>
                  </a>
                  <span className="mx-1 hidden h-5 w-px bg-black/15 sm:inline-block" aria-hidden="true" />
                  <nav aria-label="Nesta página" className="flex flex-wrap gap-1.5">
                    {ATALHOS.map(([href, rotulo]) => (
                      <a key={href} href={href} className="rounded-md bg-white/70 px-3 py-1.5 text-xs font-semibold text-brand-dark/80 transition hover:bg-white hover:text-brand">
                        {rotulo}
                      </a>
                    ))}
                  </nav>
                </div>
              </div>
            </div>
          </section>
        </FundoFestivo>

        {/* ================= Propósito + Quem participa (lado a lado) ================= */}
        <div className="grid gap-4 md:grid-cols-2">
          <Painel cor={FAIXAS.verde} titulo="Nosso propósito">
            <p className="text-sm leading-relaxed text-brand-dark/90 sm:text-base">
              Colaborar com a formação do caráter na <strong>educação infantil</strong>, proporcionando à sociedade um ser integral dotado dos valores humanos
              universais.
            </p>
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Valores humanos">
              {VALORES.map((v) => (
                <li key={v.nome} className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-xs font-bold text-brand-dark shadow-sm">
                  <span className="h-2 w-2 rounded-full" style={{ background: v.cor }} aria-hidden="true" />
                  {v.nome}
                </li>
              ))}
            </ul>

            {/* Cenário no fundo do cartão: ocupa o espaço que sobra ao lado do cartão "Quem participa" */}
            <div className="relative -mx-5 -mb-5 mt-auto hidden pt-6 sm:-mx-6 sm:-mb-6 md:block" aria-hidden="true">
              <Nuvem className="absolute right-10 top-2 w-20 opacity-90" />
              <Nuvem className="absolute left-1/2 top-8 w-14 opacity-70" />
              <div className="relative flex items-end justify-between px-6 sm:px-8">
                <div className="flex items-end gap-2">
                  <Arvore className="w-12" />
                  <CriancasPulando tamanho="w-12 lg:w-14" />
                  <Flor className="w-5" petala="#F49AC1" />
                  <Flor className="w-5" petala="#A98BC9" />
                </div>
                <Escolinha className="w-32 lg:w-40" />
              </div>
              <div className="-mt-2">
                <Grama className="!h-5 sm:!h-6" />
              </div>
            </div>
          </Painel>

          <Painel cor={FAIXAS.azul} titulo="Quem participa">
            <div className="space-y-2.5">
              <Item icone={<UserIcon className="h-5 w-5" />} cor="#01A3B8" titulo="Público-alvo">
                Crianças de 3 a 7 anos matriculadas na Educação Infantil e nos anos iniciais do Ensino Fundamental das escolas rurais e urbanas participantes.
              </Item>
              <Item icone={<BookOpenIcon className="h-5 w-5" />} cor="#01A3B8" titulo="Formação de">
                Professores, coordenadores e equipe gestora das unidades escolares.
              </Item>
              <Item icone={<BuildingIcon className="h-5 w-5" />} cor="#01A3B8" titulo="Participantes">
                Sistema FAEC/SENAR, prefeituras municipais e escolas.
              </Item>
            </div>
          </Painel>
        </div>

        {/* ================= Valores humanos ================= */}
        <section id="valores" aria-labelledby="titulo-valores" className="scroll-mt-20 rounded-2xl border border-black/5 bg-white p-5 shadow-sm sm:p-7">
          <Titulo id="titulo-valores" cor={FAIXAS.verde}>Valores humanos</Titulo>
          <p className="mt-2 text-sm leading-relaxed text-brand-dark/85 sm:text-base">
            É na primeira infância que se formam redes neuronais responsáveis pela construção do caráter. Para tal fim, a criança precisa frequentar ambientes
            de qualidade e vivenciar os valores humanos universais em ações pedagógicas repetitivas.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <CartaoValor v={valor("Amor")} centro className="md:col-start-2 md:row-start-1 md:row-span-2" />
            <CartaoValor v={valor("Paz")} className="md:col-start-1 md:row-start-1" />
            <CartaoValor v={valor("Ação correta")} className="md:col-start-3 md:row-start-1" />
            <CartaoValor v={valor("Não violência")} className="md:col-start-1 md:row-start-2" />
            <CartaoValor v={valor("Verdade")} className="md:col-start-3 md:row-start-2" />
          </div>
        </section>

        {/* ================= Premissas ================= */}
        <section id="premissas" aria-labelledby="titulo-premissas" className="scroll-mt-20 rounded-2xl border border-black/5 bg-white p-5 shadow-sm sm:p-7">
          <Titulo id="titulo-premissas" cor={FAIXAS.laranja}>Premissas</Titulo>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PREMISSAS.map((p) => (
              <li key={p.texto} className="flex items-center rounded-xl px-5 py-4 text-sm font-medium leading-snug text-[#1F2A24] sm:text-[15px]" style={{ background: p.cor }}>
                {p.texto}
              </li>
            ))}
          </ul>
        </section>

        {/* ================= Objetivos ================= */}
        <Painel id="objetivos" cor={FAIXAS.rosa} titulo="Objetivos">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <article className="rounded-xl bg-white px-5 py-4 shadow-sm">
              <h3 className="text-base font-bold" style={{ color: "#B0308F" }}>Objetivo geral</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-brand-dark/90 sm:text-[15px]">{OBJETIVO_GERAL}</p>
            </article>
            <div>
              <h3 className="mb-2 text-base font-bold" style={{ color: "#B0308F" }}>Objetivos específicos</h3>
              <ol className="grid gap-2.5 sm:grid-cols-2">
                {OBJETIVOS_ESPECIFICOS.map((texto, i) => (
                  <li key={texto} className="flex items-start gap-3 rounded-xl bg-white px-4 py-3 shadow-sm">
                    <span className="text-2xl font-extrabold leading-none" style={{ color: "#C2409F" }} aria-hidden="true">{i + 1}</span>
                    <span className="text-sm font-medium leading-snug sm:text-[15px]">{texto}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </Painel>

        {/* ================= Metodologia e formação ================= */}
        <Painel id="metodologia" cor={FAIXAS.laranja} titulo="Metodologia e formação">
          <div className="grid gap-3 md:grid-cols-3">
            <Item icone={<LightbulbIcon className="h-5 w-5" />} cor="#C98A00" titulo="Metodologia">
              Metodologia própria, com atividades lúdicas, dinâmicas e reflexões sobre os valores humanos percebidos.
            </Item>
            <Item icone={<BookOpenIcon className="h-5 w-5" />} cor="#C98A00" titulo="Formação">
              Para Coordenadores Pedagógicos e Professores das escolas participantes, para capacitá-los na aplicação da metodologia e na promoção dos valores.
            </Item>
            <Item icone={<HeartIcon className="h-5 w-5" />} cor="#F00000" titulo="Valores com o professor">
              Uma formação que o transforme num <strong>ser integral</strong>, de <strong>exemplos</strong>, e que <strong>inspire</strong> os valores humanos
              universais.
            </Item>
          </div>
        </Painel>

        {/* ================= Vídeos ================= */}
        <section id="videos" aria-labelledby="titulo-videos" className="scroll-mt-20 rounded-2xl border border-black/5 p-5 shadow-sm sm:p-7" style={{ background: tom("#1E6B45", 12) }}>
          <Titulo id="titulo-videos" cor="#1E6B45">Assista ao projeto</Titulo>
          <p className="mt-1 text-sm text-brand-dark/80 sm:text-base">Vídeos de divulgação nos municípios, na formação e no acompanhamento das escolas.</p>
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {VIDEOS_PROJETO.map((v, i) => (
              <li key={v.link}>
                <CartaoVideo video={v} cor={[FAIXAS.verde, FAIXAS.azul, FAIXAS.rosa, FAIXAS.laranja][i % 4]} onAssistir={() => setAssistindo(v)} />
              </li>
            ))}
          </ul>
        </section>

        {/* ================= Fotos recentes ================= */}
        {fotos.length > 0 && (
          <section aria-labelledby="titulo-fotos" className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Titulo id="titulo-fotos" cor={FAIXAS.verde}>O projeto em ação</Titulo>
              <a href="/galeria" className="text-sm font-bold text-brand-light hover:underline">Ver a galeria completa ›</a>
            </div>
            <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {fotos.map((d) => (
                <li key={d.id}>
                  <a href="/galeria" className="block overflow-hidden rounded-xl shadow-sm transition hover:-translate-y-0.5 hover:shadow-md" aria-label={d.acao_evento || d.acoes_pedagogicas?.nome || "Registro da galeria"}>
                    <Foto doc={d} />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ================= Parceiros ================= */}
        <section aria-labelledby="titulo-parceiros" className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm sm:p-7">
          <Titulo id="titulo-parceiros" cor={FAIXAS.verde}>Realização e parceiros</Titulo>
          <p className="mt-1 text-sm text-brand-dark/80 sm:text-base">Sistema FAEC / SENAR Ceará, em parceria com as prefeituras municipais.</p>
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-3">
            {PARCEIROS.map((p) => (
              <li key={p.nome} className="rounded-xl border border-black/10 bg-[#f6f8f5] px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-brand-dark/60">{p.papel}</p>
                <p className="mt-0.5 text-base font-bold leading-snug">{p.nome}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      {assistindo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark/70 p-4" role="dialog" aria-modal="true" aria-label={`Vídeo: ${assistindo.titulo}`} onClick={() => setAssistindo(null)}>
          <div className="w-full max-w-4xl rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="truncate font-bold">{assistindo.titulo} <span className="font-medium text-brand-dark/65">· {assistindo.rotulo}</span></p>
              <div className="flex shrink-0 items-center gap-3">
                <a href={assistindo.link} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-light hover:underline">Abrir em nova aba</a>
                <button onClick={() => setAssistindo(null)} className="rounded px-2 py-1 text-lg leading-none hover:bg-black/5" aria-label="Fechar">✕</button>
              </div>
            </div>
            <PreviewLink
              link={assistindo.link}
              className="aspect-video w-full"
              fallback={<p className="text-sm text-brand-dark/75">Não foi possível exibir aqui. Use &quot;Abrir em nova aba&quot;.</p>}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Título de seção: letra média e um traço curto na cor do slide
function Titulo({ id, cor, children }: { id?: string; cor: string; children: ReactNode }) {
  return (
    <div>
      <h2 id={id} className="text-xl font-extrabold leading-tight sm:text-2xl">{children}</h2>
      <span className="mt-1 block h-1 w-10 rounded-full" style={{ background: cor }} aria-hidden="true" />
    </div>
  );
}

// Painel em tom claro da cor do slide, com cartões brancos dentro
function Painel({ id, cor, titulo, children }: { id?: string; cor: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} aria-label={titulo} className="flex h-full scroll-mt-20 flex-col overflow-hidden rounded-2xl border border-black/5 p-5 shadow-sm sm:p-6" style={{ background: tom(cor, 16) }}>
      <h2 className="text-xl font-extrabold leading-tight sm:text-2xl">{titulo}</h2>
      <span className="mb-4 mt-1 block h-1 w-10 rounded-full" style={{ background: cor }} aria-hidden="true" />
      {children}
    </section>
  );
}

function Item({ icone, titulo, cor, children }: { icone: ReactNode; titulo: string; cor: string; children: ReactNode }) {
  return (
    <article className="flex items-start gap-3 rounded-xl bg-white px-4 py-3 shadow-sm">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ background: cor }} aria-hidden="true">{icone}</span>
      <div>
        <h3 className="text-base font-bold leading-tight">{titulo}</h3>
        <p className="mt-0.5 text-sm leading-relaxed text-brand-dark/90 sm:text-[15px]">{children}</p>
      </div>
    </article>
  );
}

// Cartão de valor: fundo claro, filete na cor do valor e o nome em letra escura
function CartaoValor({ v, centro, className = "" }: { v: ValorProjeto; centro?: boolean; className?: string }) {
  return (
    <article
      className={`relative flex flex-col justify-center overflow-hidden rounded-2xl border border-black/5 p-4 pt-5 sm:p-5 sm:pt-6 ${centro ? "items-center text-center" : ""} ${className}`}
      style={{ background: tom(v.cor, 13) }}
    >
      {/* faixa na cor do valor, cortada pelos cantos do cartão */}
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5" style={{ background: v.cor }} />
      {centro && (
        <span className="mb-2 flex h-14 w-14 items-center justify-center rounded-full text-white" style={{ background: v.cor }} aria-hidden="true">
          <HeartIcon className="h-7 w-7" />
        </span>
      )}
      {v.dimensao && (
        <span className="mb-1 inline-block w-fit rounded-md bg-white/80 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-brand-dark/70">{v.dimensao}</span>
      )}
      <h3 className={`${centro ? "text-3xl" : "text-xl"} font-extrabold uppercase leading-tight`}>{v.nome}</h3>
      <p className={`mt-1 leading-snug text-brand-dark/85 ${centro ? "text-base" : "text-sm sm:text-[15px]"}`}>{v.frase}</p>
    </article>
  );
}

function Foto({ doc }: { doc: DocumentoGaleria }) {
  const candidatos = urlsMiniatura(doc);
  const [tentativa, setTentativa] = useState(0);
  const url = candidatos[tentativa];
  return (
    <span className="relative block aspect-square bg-gradient-to-br from-brand-light/25 to-brand-light/5">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setTentativa((t) => t + 1)} className="absolute inset-0 h-full w-full object-cover" />
      )}
    </span>
  );
}

// Capa do vídeo: 1) imagem em public/videos-projeto (opcional), 2) imagem do próprio vídeo, buscada no Drive, 3) cartão colorido
function CartaoVideo({ video, cor, onAssistir }: { video: VideoProjeto; cor: string; onAssistir: () => void }) {
  const candidatos = [video.capa, ...urlsMiniatura({ drive_file_id: idDoDrive(video.link), link_externo: video.link })].filter(Boolean) as string[];
  const [tentativa, setTentativa] = useState(0);
  const url = candidatos[tentativa];
  return (
    <button
      type="button"
      onClick={onAssistir}
      className="group block w-full overflow-hidden rounded-xl bg-white text-left text-brand-dark shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-light"
    >
      <span className="relative block aspect-video overflow-hidden" style={{ background: url ? undefined : tom(cor, 55) }}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setTentativa((t) => t + 1)} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-lg font-extrabold leading-tight text-[#1A1A1A]">{video.titulo}</span>
        )}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-sm text-white transition group-hover:scale-110" aria-hidden="true">▶</span>
        </span>
      </span>
      <span className="block px-3 py-2">
        <span className="block text-[10px] font-bold uppercase tracking-wide text-brand-dark/60">{video.rotulo}</span>
        <span className="block text-sm font-bold leading-snug">{video.titulo}</span>
      </span>
    </button>
  );
}
