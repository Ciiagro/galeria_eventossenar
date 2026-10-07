"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EscolaParticipanteGaleria } from "@/lib/api";

type MunicipioMapa = { id: number; nome: string; d: string; cx: number; cy: number };
type DadosMapa = {
  largura: number;
  altura: number;
  projecao: { lon0: number; lat1: number; kx: number; escala: number; margem: number };
  municipios: MunicipioMapa[];
};

type Props = {
  municipiosParticipantes: Set<number>;
  /** município mostrado no painel ao lado (fica destacado) */
  destaqueId: number | null;
  /** município escolhido pela pessoa: fica em destaque e os demais ficam mais claros (o mapa não muda de tamanho) */
  focoId?: number | null;
  escolas: EscolaParticipanteGaleria[];
  onClicarMunicipio: (id: number) => void;
  onClicarEscola: (escola: EscolaParticipanteGaleria) => void;
  className?: string;
};

export const COR_PARTICIPANTE = "#2E7D4F";
const COR_PARTICIPANTE_CLARA = "#A9D3B8"; // participantes quando outro município está em foco
const COR_DESTAQUE = "#123A26";
const COR_NEUTRA = "#E4E9E5";
const COR_DIVISA = "#5E7364"; // linhas de divisa entre os municípios (mais escuras)
// forma do pin: a ponta fica em (0,0) e a cabeça redonda em (0,-19)
const PIN = "M0 0 C-5 -8 -10 -13 -10 -19 a10 10 0 1 1 20 0 C10 -13 5 -8 0 0 Z";

export default function MapaCearaGaleria({
  municipiosParticipantes,
  destaqueId,
  focoId = null,
  escolas,
  onClicarMunicipio,
  onClicarEscola,
  className = "h-[300px]",
}: Props) {
  const [mapa, setMapa] = useState<DadosMapa | null>(null);
  const [dica, setDica] = useState<{ texto: string; x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    fetch("/mapa-ceara.json").then((r) => r.json()).then(setMapa).catch(() => null);
  }, []);

  // município em destaque: o escolhido (foco) ou, sem escolha, o do painel
  const realceId = focoId ?? destaqueId;
  const municipioRealce = mapa?.municipios.find((m) => m.id === realceId) ?? null;

  // Todas as escolas participantes com localização.
  // Ordem: do norte para o sul, para o pin mais ao sul ficar por cima; as do município em destaque por último (no topo).
  const escolasComLocal = useMemo(
    () =>
      escolas
        .filter((e) => e.latitude != null && e.longitude != null)
        .sort((a, b) => Number(a.municipio_id === realceId) - Number(b.municipio_id === realceId) || b.latitude! - a.latitude!),
    [escolas, realceId]
  );

  function projetar(lat: number, lon: number) {
    const p = mapa!.projecao;
    return { x: p.margem + (lon - p.lon0) * p.kx * p.escala, y: p.margem + (p.lat1 - lat) * p.escala };
  }
  function posicao(e: React.MouseEvent) {
    const caixa = svgRef.current?.parentElement?.getBoundingClientRect();
    return { x: e.clientX - (caixa?.left ?? 0), y: e.clientY - (caixa?.top ?? 0) };
  }

  return (
    <div className="relative">
      {!mapa && <div className={`${className} flex items-center justify-center text-sm text-brand-dark/60`}>Carregando mapa...</div>}
      {mapa && (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${mapa.largura} ${mapa.altura}`}
          className={`w-full overflow-visible ${className}`}
          onMouseLeave={() => setDica(null)}
          role="img"
          aria-label="Mapa do Ceará com os municípios e as escolas participantes"
        >
          {mapa.municipios.map((m) => {
            const participou = municipiosParticipantes.has(m.id);
            const destaque = m.id === realceId;
            const apagado = focoId != null && participou && !destaque; // outro município está em foco
            return (
              <path
                key={m.id}
                d={m.d}
                fill={destaque ? COR_DESTAQUE : apagado ? COR_PARTICIPANTE_CLARA : participou ? COR_PARTICIPANTE : COR_NEUTRA}
                stroke={destaque ? COR_DESTAQUE : COR_DIVISA}
                strokeWidth={destaque ? 1.8 : 1.1}
                strokeLinejoin="round"
                className={`transition-[fill] duration-300 ${participou ? "cursor-pointer hover:brightness-110" : ""}`}
                onMouseMove={(e) => participou && setDica({ texto: m.nome, ...posicao(e) })}
                onMouseLeave={() => setDica(null)}
                onClick={() => participou && onClicarMunicipio(m.id)}
              />
            );
          })}
          {/* Nomes de todos os municípios (bem pequenos) */}
          <g pointerEvents="none" fontSize={5.5} fontWeight={600} textAnchor="middle" fill="#2F3F34" stroke="#fff" strokeWidth={1.4} paintOrder="stroke" strokeLinejoin="round">
            {mapa.municipios.map((m) =>
              m.id === realceId ? null : (
                <text key={m.id} x={m.cx} y={m.cy} dominantBaseline="middle">
                  {m.nome}
                </text>
              )
            )}
          </g>
          {/* Município em destaque: anel pulsando */}
          {municipioRealce && (
            <g pointerEvents="none">
              <circle cx={municipioRealce.cx} cy={municipioRealce.cy} r={24} fill="none" stroke="#FBBF24" strokeWidth={5}>
                <animate attributeName="r" values="18;48;18" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.9;0;0.9" dur="2.4s" repeatCount="indefinite" />
              </circle>
            </g>
          )}
          {/* Pins das escolas participantes (ponta do pin = local da escola) */}
          {escolasComLocal.map((e) => {
            const { x, y } = projetar(e.latitude!, e.longitude!);
            const doRealce = e.municipio_id === realceId;
            return (
              <g
                key={e.id}
                transform={`translate(${x} ${y}) scale(${doRealce ? 1.5 : 0.95})`}
                opacity={focoId != null && !doRealce ? 0.55 : 1}
                className="cursor-pointer"
                onMouseMove={(ev) => setDica({ texto: e.nome, ...posicao(ev) })}
                onMouseLeave={() => setDica(null)}
                onClick={() => onClicarEscola(e)}
              >
                <path d={PIN} fill="#FBBF24" stroke="#fff" strokeWidth={2.2} strokeLinejoin="round" />
                <circle cx={0} cy={-19} r={4} fill="#123A26" />
              </g>
            );
          })}
          {municipioRealce && (
            <text
              x={municipioRealce.cx}
              y={municipioRealce.cy - 34}
              textAnchor="middle"
              fontSize={34}
              fontWeight={700}
              fill="#123A26"
              stroke="#fff"
              strokeWidth={8}
              paintOrder="stroke"
              pointerEvents="none"
            >
              {municipioRealce.nome}
            </text>
          )}
        </svg>
      )}
      {mapa && <span className="pointer-events-none absolute right-2 top-1 text-[10px] font-semibold text-brand-dark/50 leading-none text-center">N<br />▲</span>}
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
