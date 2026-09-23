"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EscolaParticipante } from "@/lib/api";
import { MapPinIcon } from "@/components/icons";

type MunicipioMapa = { id: number; nome: string; d: string; cx: number; cy: number };
type DadosMapa = {
  largura: number;
  altura: number;
  projecao: { lon0: number; lat1: number; kx: number; escala: number; margem: number };
  municipios: MunicipioMapa[];
};

export type MunicipioResumoMapa = {
  id: number | string;
  nome: string;
  total_documentos?: number;
  escolas_total: number;
  escolas_participantes: number;
};

type Props = {
  municipios: MunicipioResumoMapa[];
  escolas: EscolaParticipante[];
};

const COR_SEM_PARTICIPACAO = "#D9DDDB";
const COR_SEM_ESCOLA = "#C7E3C4";
const COR_ESCOLA_MIN = [134, 196, 145]; // verde médio
const COR_ESCOLA_MAX = [30, 70, 50]; // brand (#1E4632)

function corPorEscolas(qtd: number, maximo: number) {
  const t = maximo <= 1 ? 1 : Math.sqrt((qtd - 1) / (maximo - 1));
  const c = COR_ESCOLA_MIN.map((v, i) => Math.round(v + (COR_ESCOLA_MAX[i] - v) * t));
  return `rgb(${c.join(",")})`;
}

type Destaque =
  | { tipo: "municipio"; nome: string; escolas: number; escolasTotal: number; documentos: number }
  | { tipo: "escola"; nome: string; municipio: string; documentos: number; programas: string[] };

export default function MapaMunicipios({ municipios, escolas }: Props) {
  const router = useRouter();
  const [mapa, setMapa] = useState<DadosMapa | null>(null);
  const [erro, setErro] = useState(false);
  const [mostrarEscolas, setMostrarEscolas] = useState(true);
  const [destaque, setDestaque] = useState<Destaque | null>(null);

  useEffect(() => {
    fetch("/mapa-ceara.json")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setMapa)
      .catch(() => setErro(true));
  }, []);

  const dadosPorId = useMemo(() => {
    const m = new Map<number, MunicipioResumoMapa>();
    municipios.forEach((municipio) => m.set(Number(municipio.id), municipio));
    return m;
  }, [municipios]);

  const maxEscolas = useMemo(
    () => Math.max(1, ...municipios.map((m) => m.escolas_participantes || 0)),
    [municipios]
  );

  const escolasVisiveis = useMemo(
    () => escolas.filter((e) => dadosPorId.has(Number(e.municipio_id)) && e.latitude != null && e.longitude != null),
    [escolas, dadosPorId]
  );

  const destaquesFixos = useMemo(() => {
    if (!mapa) return [];
    return [...municipios]
      .filter((m) => m.escolas_participantes > 0)
      .sort((a, b) => b.escolas_participantes - a.escolas_participantes)
      .slice(0, 5)
      .map((m) => mapa.municipios.find((g) => g.id === Number(m.id)))
      .filter(Boolean) as MunicipioMapa[];
  }, [mapa, municipios]);

  function projetar(lat: number, lon: number) {
    const p = mapa!.projecao;
    return {
      x: p.margem + (lon - p.lon0) * p.kx * p.escala,
      y: p.margem + (p.lat1 - lat) * p.escala,
    };
  }

  const nomePorId = useMemo(() => {
    const m = new Map<number, string>();
    mapa?.municipios.forEach((g) => m.set(g.id, g.nome));
    return m;
  }, [mapa]);

  // escala gráfica: 100 km em pixels do viewBox
  const px100km = mapa ? (100 / 111.32) * mapa.projecao.escala : 0;

  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-sm p-5 flex flex-col">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-light/10 text-brand-light flex items-center justify-center">
            <MapPinIcon className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-semibold text-brand-dark">Mapa dos municípios</h2>
            <p className="text-xs text-brand-dark/75">Escolas participantes por município</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-brand-dark/85">
          <Legenda cor={corPorEscolas(maxEscolas, maxEscolas)} texto="Com escolas participantes" />
          <Legenda cor={COR_SEM_ESCOLA} texto="Documentos sem escola vinculada" />
          <Legenda cor={COR_SEM_PARTICIPACAO} texto="Não participante" />
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={mostrarEscolas}
              onChange={(e) => setMostrarEscolas(e.target.checked)}
              className="accent-brand-light"
            />
            Mostrar escolas ({escolasVisiveis.length})
          </label>
        </div>
      </div>

      <div className="relative flex-1 min-h-[360px]">
        {erro && <p className="text-sm text-status-pendente">Não foi possível carregar o mapa.</p>}
        {!mapa && !erro && <p className="text-sm text-brand-dark/75">Carregando mapa...</p>}

        {mapa && (
          <svg
            viewBox={`0 0 ${mapa.largura} ${mapa.altura}`}
            className="w-full h-full max-h-[620px]"
            role="img"
            aria-label="Mapa do Ceará com as escolas participantes por município"
            onMouseLeave={() => setDestaque(null)}
          >
            <g>
              {mapa.municipios.map((g) => {
                const dados = dadosPorId.get(g.id);
                const escolasPart = dados?.escolas_participantes ?? 0;
                const docs = dados?.total_documentos ?? 0;
                const cor = escolasPart > 0 ? corPorEscolas(escolasPart, maxEscolas) : docs > 0 ? COR_SEM_ESCOLA : COR_SEM_PARTICIPACAO;
                const clicavel = docs > 0;
                return (
                  <path
                    key={g.id}
                    d={g.d}
                    fill={cor}
                    stroke="#ffffff"
                    strokeWidth={0.7}
                    strokeLinejoin="round"
                    className={`transition-opacity hover:opacity-80 ${clicavel ? "cursor-pointer" : ""}`}
                    onMouseEnter={() =>
                      setDestaque({
                        tipo: "municipio",
                        nome: g.nome,
                        escolas: escolasPart,
                        escolasTotal: dados?.escolas_total ?? 0,
                        documentos: docs,
                      })
                    }
                    onClick={() => clicavel && router.push(`/municipios/${g.id}`)}
                  />
                );
              })}
            </g>

            {mostrarEscolas && (
              <g>
                {escolasVisiveis.map((e) => {
                  const { x, y } = projetar(e.latitude!, e.longitude!);
                  return (
                    <circle
                      key={e.id}
                      cx={x}
                      cy={y}
                      r={3.2}
                      fill="#ffffff"
                      stroke="#122E20"
                      strokeWidth={1.3}
                      className="cursor-pointer"
                      onMouseEnter={() =>
                        setDestaque({
                          tipo: "escola",
                          nome: e.nome,
                          municipio: nomePorId.get(Number(e.municipio_id)) ?? "",
                          documentos: e.documentos,
                          programas: e.programas ?? [],
                        })
                      }
                      onClick={() => router.push(`/municipios/${e.municipio_id}`)}
                    />
                  );
                })}
              </g>
            )}

            <g pointerEvents="none">
              {destaquesFixos.map((g) => (
                <text
                  key={g.id}
                  x={g.cx}
                  y={g.cy - 7}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={600}
                  fill="#122E20"
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {g.nome}
                </text>
              ))}
            </g>

            {/* norte e escala */}
            <g transform={`translate(24, ${mapa.altura - 70})`} fill="#122E20" fontSize={11}>
              <text x={0} y={0} textAnchor="middle" fontWeight={600}>N</text>
              <path d="M0,4 L-6,20 L0,16 L6,20 Z" />
              <g transform="translate(-6, 42)">
                <rect x={0} y={0} width={px100km / 2} height={5} fill="#122E20" />
                <rect x={px100km / 2} y={0} width={px100km / 2} height={5} fill="#ffffff" stroke="#122E20" strokeWidth={1} />
                <text x={0} y={18} textAnchor="middle">0</text>
                <text x={px100km / 2} y={18} textAnchor="middle">50</text>
                <text x={px100km} y={18} textAnchor="middle">100 km</text>
              </g>
            </g>
          </svg>
        )}

        {destaque && (
          <div className="absolute top-2 right-2 max-w-[260px] rounded-lg bg-white/95 border border-black/10 shadow-md px-3 py-2 text-xs pointer-events-none">
            <p className="font-semibold text-brand-dark text-sm leading-snug">{destaque.nome}</p>
            {destaque.tipo === "municipio" ? (
              <>
                <p className="text-brand-dark/85 mt-0.5">
                  {destaque.escolas} de {destaque.escolasTotal} escolas participantes
                </p>
                <p className="text-brand-dark/75">{destaque.documentos} documentos inseridos</p>
              </>
            ) : (
              <>
                <p className="text-brand-dark/85 mt-0.5">{destaque.municipio}</p>
                {destaque.programas.length > 0 && (
                  <p className="text-brand-light mt-0.5">Programa: {destaque.programas.join(", ")}</p>
                )}
                <p className="text-brand-dark/75">{destaque.documentos} documentos inseridos</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cor }} />
      {texto}
    </span>
  );
}
