"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EscolaParticipanteGaleria } from "@/lib/api";

type MunicipioMapa = { id: number; nome: string; d: string; cx: number; cy: number };
type DadosMapa = {
  largura: number;
  altura: number;
  projecao: { lon0: number; lat1: number; kx: number; escala: number; margem: number };
  municipios: MunicipioMapa[];
};
type Vista = { k: number; tx: number; ty: number };

type Props = {
  municipiosParticipantes: Set<number>;
  /** município selecionado: fica destacado em dourado */
  destaqueId?: number | null;
  /** município escolhido: o mapa dá zoom nele. Quando volta a ser null, o mapa volta ao Ceará inteiro */
  focoId?: number | null;
  /** muda de valor quando a página pede para voltar à visão geral */
  resetSinal?: number;
  escolas: EscolaParticipanteGaleria[];
  onClicarMunicipio: (id: number) => void;
  /** o visitante pediu para ver o Ceará inteiro (botão ⟲): a página limpa o município escolhido */
  onVerCearaInteiro?: () => void;
  /** não é mais usado (o mapa não mostra pins), mantido para não quebrar quem chama */
  onClicarEscola?: (escola: EscolaParticipanteGaleria) => void;
  className?: string;
};

export const COR_PARTICIPANTE = "#12803F"; // município participante
export const COR_PARTICIPANTE_FORTE = "#157A41"; // ao passar o mouse
export const COR_SELECIONADO = "#F5B301"; // município escolhido
const COR_NEUTRA = "#D3EBD2"; // município que ainda não participa (verde-claro)
const COR_DIVISA = "#FFFFFF"; // divisa dos participantes
const COR_DIVISA_NEUTRA = "#7FA384";
const COR_CONTORNO = "#1F5A38"; // linha escura em volta de todo o Ceará

const ZOOM_MAX = 14;
const VISTA_INICIAL: Vista = { k: 1, tx: 0, ty: 0 };

export default function MapaCearaGaleria({
  municipiosParticipantes,
  focoId = null,
  destaqueId = null,
  resetSinal = 0,
  escolas,
  onClicarMunicipio,
  onVerCearaInteiro,
  className = "h-[300px]",
}: Props) {
  const [mapa, setMapa] = useState<DadosMapa | null>(null);
  const [dica, setDica] = useState<{ texto: string; x: number; y: number } | null>(null);
  const [vista, setVista] = useState<Vista>(VISTA_INICIAL);
  const [animando, setAnimando] = useState(false);
  const [ampliado, setAmpliado] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const caminhos = useRef<Map<number, SVGPathElement>>(new Map());
  const ponteiros = useRef<Map<number, { x: number; y: number }>>(new Map());
  const arrasto = useRef<{ moveu: boolean; distPinca: number | null }>({ moveu: false, distPinca: null });
  const vistaRef = useRef(vista);
  vistaRef.current = vista;

  useEffect(() => {
    fetch("/mapa-ceara.json").then((r) => r.json()).then(setMapa).catch(() => null);
  }, []);

  // ---------- utilidades de zoom ----------
  const limitar = useCallback(
    (v: Vista): Vista => {
      if (!mapa) return v;
      const k = Math.min(ZOOM_MAX, Math.max(1, v.k));
      const tx = Math.min(0, Math.max(mapa.largura - mapa.largura * k, v.tx));
      const ty = Math.min(0, Math.max(mapa.altura - mapa.altura * k, v.ty));
      return { k, tx, ty };
    },
    [mapa]
  );

  /** converte um ponto da tela para as coordenadas do SVG (sem zoom) */
  const paraSvg = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const r = pt.matrixTransform(m.inverse());
    return { x: r.x, y: r.y };
  }, []);

  const aplicar = useCallback(
    (v: Vista, suave = false) => {
      setAnimando(suave);
      setVista(limitar(v));
    },
    [limitar]
  );

  const zoomEm = useCallback(
    (cx: number, cy: number, fator: number, suave = false) => {
      const atual = vistaRef.current;
      const k = Math.min(ZOOM_MAX, Math.max(1, atual.k * fator));
      const r = k / atual.k;
      aplicar({ k, tx: cx - (cx - atual.tx) * r, ty: cy - (cy - atual.ty) * r }, suave);
    },
    [aplicar]
  );

  function zoomBotao(fator: number) {
    if (!mapa) return;
    zoomEm(mapa.largura / 2, mapa.altura / 2, fator, true);
  }

  const irParaMunicipio = useCallback(
    (id: number) => {
      const el = caminhos.current.get(id);
      if (!mapa || !el) return;
      const b = el.getBBox();
      const k = Math.min(10, Math.max(2.2, Math.min(mapa.largura / (b.width * 1.8), mapa.altura / (b.height * 1.8))));
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      aplicar({ k, tx: mapa.largura / 2 - cx * k, ty: mapa.altura / 2 - cy * k }, true);
    },
    [mapa, aplicar]
  );

  const verCearaInteiro = useCallback(() => aplicar(VISTA_INICIAL, true), [aplicar]);

  // município escolhido fora do mapa (filtro, lista...) → zoom nele; sem escolha → visão geral
  useEffect(() => {
    if (!mapa) return;
    if (focoId == null) verCearaInteiro();
    else irParaMunicipio(focoId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focoId, mapa]);

  useEffect(() => {
    if (mapa && resetSinal) verCearaInteiro();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSinal]);

  // ESC fecha a tela cheia
  useEffect(() => {
    if (!ampliado) return;
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && setAmpliado(false);
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [ampliado]);

  // scroll do mouse = zoom (precisa ser listener não passivo para impedir a página de rolar)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function roda(e: WheelEvent) {
      e.preventDefault();
      const { x, y } = paraSvg(e.clientX, e.clientY);
      zoomEm(x, y, e.deltaY < 0 ? 1.25 : 1 / 1.25);
    }
    svg.addEventListener("wheel", roda, { passive: false });
    return () => svg.removeEventListener("wheel", roda);
  }, [mapa, paraSvg, zoomEm]);

  // ---------- arrastar (mouse/dedo) e pinça ----------
  function aoPressionar(e: React.PointerEvent) {
    ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    arrasto.current = { moveu: false, distPinca: null };
  }
  function aoMover(e: React.PointerEvent) {
    const anterior = ponteiros.current.get(e.pointerId);
    if (!anterior) return;
    const atual = { x: e.clientX, y: e.clientY };
    ponteiros.current.set(e.pointerId, atual);
    const pts = Array.from(ponteiros.current.values());

    if (pts.length >= 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const meio = paraSvg((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
      if (arrasto.current.distPinca) zoomEm(meio.x, meio.y, dist / arrasto.current.distPinca);
      arrasto.current = { moveu: true, distPinca: dist };
      setDica(null);
      return;
    }

    const dx = atual.x - anterior.x;
    const dy = atual.y - anterior.y;
    if (!arrasto.current.moveu && Math.hypot(dx, dy) < 3) return;
    if (vistaRef.current.k <= 1) return; // sem zoom não há o que arrastar
    arrasto.current.moveu = true;
    setDica(null);
    // converte o deslocamento da tela para unidades do SVG
    const a = paraSvg(anterior.x, anterior.y);
    const b = paraSvg(atual.x, atual.y);
    const v = vistaRef.current;
    aplicar({ k: v.k, tx: v.tx + (b.x - a.x), ty: v.ty + (b.y - a.y) });
  }
  function aoSoltar(e: React.PointerEvent) {
    ponteiros.current.delete(e.pointerId);
    arrasto.current.distPinca = null;
  }
  /** cliques logo depois de arrastar não contam como clique */
  function clique(fn: () => void) {
    return () => {
      if (arrasto.current.moveu) return;
      fn();
    };
  }

  // ---------- dados ----------
  const escolasPorMunicipio = useMemo(() => {
    const m = new Map<number, number>();
    escolas.forEach((e) => e.municipio_id && m.set(e.municipio_id, (m.get(e.municipio_id) ?? 0) + 1));
    return m;
  }, [escolas]);

  function textoDica(id: number, nome: string) {
    const n = escolasPorMunicipio.get(id) ?? 0;
    return n > 0 ? `${nome} · ${n} ${n === 1 ? "escola" : "escolas"}` : nome;
  }
  function posicao(e: React.MouseEvent) {
    const caixa = caixaRef.current?.getBoundingClientRect();
    return { x: e.clientX - (caixa?.left ?? 0), y: e.clientY - (caixa?.top ?? 0) };
  }

  const { k, tx, ty } = vista;
  const mostrarNomes = k >= 2.2;

  const botao =
    "flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 bg-white/95 text-base font-bold text-brand-dark shadow-sm hover:bg-brand-light/10 disabled:opacity-40 disabled:hover:bg-white";

  return (
    <div
      ref={caixaRef}
      className={ampliado ? "fixed inset-3 z-50 rounded-2xl bg-white p-3 shadow-2xl ring-1 ring-black/10 sm:inset-6" : "relative"}
    >
      {!mapa && <div className={`${className} flex items-center justify-center text-sm text-brand-dark/60`}>Carregando mapa...</div>}
      {mapa && (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${mapa.largura} ${mapa.altura}`}
          className={`w-full select-none ${ampliado ? "h-full" : className} ${k > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
          style={{ touchAction: k > 1 ? "none" : "pan-y" }}
          onPointerDown={aoPressionar}
          onPointerMove={aoMover}
          onPointerUp={aoSoltar}
          onPointerCancel={aoSoltar}
          onPointerLeave={aoSoltar}
          onMouseLeave={() => setDica(null)}
          role="img"
          aria-label="Mapa do Ceará com os municípios participantes em verde. Use a roda do mouse ou os botões para aproximar."
        >
          <defs>
            <filter id="sombra-mapa" x="-15%" y="-15%" width="130%" height="135%">
              <feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#0B3D1E" floodOpacity="0.35" />
            </filter>
          </defs>
          <g
            style={{
              transform: `translate(${tx}px, ${ty}px) scale(${k})`,
              transformOrigin: "0 0",
              transition: animando ? "transform 0.45s ease" : "none",
            }}
            onTransitionEnd={() => setAnimando(false)}
          >
            {/* Contorno escuro + sombra: os municípios são desenhados duas vezes; esta camada fica por baixo,
                e só a metade de fora da linha grossa aparece, formando a borda do estado inteiro */}
            <g pointerEvents="none" filter="url(#sombra-mapa)">
              {mapa.municipios.map((m) => (
                <path
                  key={`contorno-${m.id}`}
                  d={m.d}
                  fill={COR_CONTORNO}
                  stroke={COR_CONTORNO}
                  strokeWidth={4}
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                />
              ))}
            </g>

            {mapa.municipios.map((m) => {
              const participou = municipiosParticipantes.has(m.id);
              const selecionado = destaqueId === m.id;
              return (
                <path
                  key={m.id}
                  ref={(el) => {
                    if (el) caminhos.current.set(m.id, el);
                  }}
                  d={m.d}
                  fill={selecionado ? COR_SELECIONADO : participou ? COR_PARTICIPANTE : COR_NEUTRA}
                  stroke={participou ? COR_DIVISA : COR_DIVISA_NEUTRA}
                  strokeWidth={participou ? 1.2 : 0.6}
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                  className={participou ? "cursor-pointer transition-colors duration-150 hover:fill-[#0B6030]" : ""}
                  style={selecionado ? { fill: COR_SELECIONADO } : undefined}
                  onMouseMove={(e) => participou && !arrasto.current.moveu && setDica({ texto: m.nome, ...posicao(e) })}
                  onMouseLeave={() => setDica(null)}
                  onClick={clique(() => {
                    if (!participou) return;
                    onClicarMunicipio(m.id);
                    irParaMunicipio(m.id);
                  })}
                />
              );
            })}

            {/* Nomes dos municípios: só aparecem com zoom, para ficarem legíveis */}
            {mostrarNomes && (
              <g pointerEvents="none" fontWeight={700} textAnchor="middle" fill="#123A26" stroke="#fff" strokeLinejoin="round" paintOrder="stroke"
                 fontSize={Math.max(2.6, 11 / k)} strokeWidth={Math.max(0.6, 3 / k)}>
                {mapa.municipios.map((m) => (
                  <text key={m.id} x={m.cx} y={m.cy} dominantBaseline="middle">
                    {m.nome}
                  </text>
                ))}
              </g>
            )}
          </g>
        </svg>
      )}

      {mapa && (
        <>
          <div className="absolute right-2 top-2 flex flex-col gap-1.5">
            <button type="button" className={botao} onClick={() => zoomBotao(1.8)} disabled={k >= ZOOM_MAX} aria-label="Aproximar" title="Aproximar">+</button>
            <button type="button" className={botao} onClick={() => zoomBotao(1 / 1.8)} disabled={k <= 1} aria-label="Afastar" title="Afastar">−</button>
            <button type="button" className={botao} onClick={() => (onVerCearaInteiro ? onVerCearaInteiro() : verCearaInteiro())} disabled={k <= 1 && destaqueId == null} aria-label="Ver o Ceará inteiro" title="Ver o Ceará inteiro">⟲</button>
            <button type="button" className={botao} onClick={() => setAmpliado((v) => !v)} aria-label={ampliado ? "Sair da tela cheia" : "Ampliar o mapa"} title={ampliado ? "Sair da tela cheia (Esc)" : "Ampliar o mapa"}>
              {ampliado ? "✕" : "⤢"}
            </button>
          </div>
          <span className="pointer-events-none absolute left-2 top-2 text-[10px] font-semibold text-brand-dark/50 leading-none text-center">N<br />▲</span>
        </>
      )}
      {dica && (
        <div
          className="pointer-events-none absolute z-10 max-w-[220px] rounded-md bg-brand-dark px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg"
          style={{ left: dica.x + 12, top: dica.y + 12 }}
        >
          {dica.texto}
        </div>
      )}
    </div>
  );
}
