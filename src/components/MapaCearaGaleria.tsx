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
  /** (não usado para aproximar: o mapa mostra sempre o Ceará inteiro) */
  zoomId?: string;
  escolas: EscolaParticipanteGaleria[];
  onClicarMunicipio: (id: number) => void;
  onClicarEscola: (escola: EscolaParticipanteGaleria) => void;
  className?: string;
};

export const COR_PARTICIPANTE = "#2E7D4F";
const COR_DESTAQUE = "#123A26";
const COR_NEUTRA = "#E4E9E5";
const COR_DIVISA = "#9DAEA1"; // linhas de divisa entre os municípios

export default function MapaCearaGaleria({
  municipiosParticipantes,
  destaqueId,

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

  // Escolas (com localização) do município em destaque
  const escolasDoDestaque = useMemo(
    () => (destaqueId ? escolas.filter((e) => e.municipio_id === destaqueId && e.latitude != null && e.longitude != null) : []),
    [escolas, destaqueId]
  );
  const municipioDestaque = mapa?.municipios.find((m) => m.id === destaqueId) ?? null;

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
          aria-label="Mapa do Ceará com os municípios participantes"
        >
          {mapa.municipios.map((m) => {
            const participou = municipiosParticipantes.has(m.id);
            const destaque = m.id === destaqueId;
            return (
              <path
                key={m.id}
                d={m.d}
                fill={destaque ? COR_DESTAQUE : participou ? COR_PARTICIPANTE : COR_NEUTRA}
                stroke={COR_DIVISA}
                strokeWidth={destaque ? 1.6 : 0.9}
                strokeLinejoin="round"
                className={participou ? "cursor-pointer hover:brightness-110" : ""}
                onMouseMove={(e) => participou && setDica({ texto: m.nome, ...posicao(e) })}
                onMouseLeave={() => setDica(null)}
                onClick={() => participou && onClicarMunicipio(m.id)}
              />
            );
          })}
          {/* Município em destaque: anel pulsando + nome, sem aproximar o mapa */}
          {municipioDestaque && (
            <g pointerEvents="none">
              <circle cx={municipioDestaque.cx} cy={municipioDestaque.cy} r={24} fill="none" stroke="#FBBF24" strokeWidth={5}>
                <animate attributeName="r" values="18;48;18" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.9;0;0.9" dur="2.4s" repeatCount="indefinite" />
              </circle>
            </g>
          )}
          {escolasDoDestaque.map((e) => {
            const { x, y } = projetar(e.latitude!, e.longitude!);
            return (
              <circle
                key={e.id}
                cx={x}
                cy={y}
                r={9}
                fill="#FBBF24"
                stroke="#fff"
                strokeWidth={2.5}
                className="cursor-pointer"
                onMouseMove={(ev) => setDica({ texto: e.nome, ...posicao(ev) })}
                onMouseLeave={() => setDica(null)}
                onClick={() => onClicarEscola(e)}
              />
            );
          })}
          {municipioDestaque && (
            <text
              x={municipioDestaque.cx}
              y={municipioDestaque.cy - 34}
              textAnchor="middle"
              fontSize={34}
              fontWeight={700}
              fill="#123A26"
              stroke="#fff"
              strokeWidth={8}
              paintOrder="stroke"
              pointerEvents="none"
            >
              {municipioDestaque.nome}
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
