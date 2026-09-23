"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EscolaParticipanteGaleria } from "@/lib/api";
import { carregarLeaflet } from "@/components/EscolasMapa";

const CORES = ["#1E4632", "#0369A1", "#B45309", "#7C3AED", "#BE123C", "#0F766E", "#4D7C0F", "#C2410C"];

function escaparHtml(texto: string) {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Escolas que realmente participaram (com ação aprovada) no município:
// resumo por programa, mapa só com essas escolas e a lista delas.
export default function EscolasParticipantes({ escolas, semMapa = false }: { escolas: EscolaParticipanteGaleria[]; semMapa?: boolean }) {
  const [programaSelecionado, setProgramaSelecionado] = useState("");
  const [mostrarTodas, setMostrarTodas] = useState(false);

  const programas = useMemo(() => {
    const mapa = new Map<string, { escolas: number; acoes: number }>();
    escolas.forEach((escola) =>
      escola.programas.forEach((p) => {
        const atual = mapa.get(p.nome) ?? { escolas: 0, acoes: 0 };
        mapa.set(p.nome, { escolas: atual.escolas + 1, acoes: atual.acoes + p.acoes });
      })
    );
    return Array.from(mapa.entries())
      .map(([nome, dados]) => ({ nome, ...dados }))
      .sort((a, b) => b.escolas - a.escolas || a.nome.localeCompare(b.nome));
  }, [escolas]);

  const corDoPrograma = useMemo(() => {
    const cores = new Map<string, string>();
    programas.forEach((p, i) => cores.set(p.nome, p.nome === "Sem programa" ? "#6B7280" : CORES[i % CORES.length]));
    return (nome: string) => cores.get(nome) ?? "#6B7280";
  }, [programas]);

  const escolasVisiveis = useMemo(
    () =>
      programaSelecionado
        ? escolas.filter((e) => e.programas.some((p) => p.nome === programaSelecionado))
        : escolas,
    [escolas, programaSelecionado]
  );
  const semLocalizacao = escolasVisiveis.filter((e) => e.latitude == null || e.longitude == null).length;
  const listaExibida = mostrarTodas ? escolasVisiveis : escolasVisiveis.slice(0, 12);

  if (!escolas.length) {
    return (
      <div className="rounded-xl border border-black/5 bg-white p-5 text-sm text-brand-dark/80">
        Ainda não há escolas com ações aprovadas neste município.
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-black/5 bg-white shadow-sm">
      <div className="px-5 py-4 border-b border-black/5">
        <h2 className="text-base font-semibold text-brand-dark">Escolas participantes</h2>
        <p className="text-sm text-brand-dark/80">
          {escolas.length} {escolas.length === 1 ? "escola participou" : "escolas participaram"} de{" "}
          {programas.length} {programas.length === 1 ? "programa" : "programas"}
        </p>
      </div>

      {/* Resumo por programa (clique para filtrar) */}
      <div className="px-5 pt-4 flex flex-wrap gap-2">
        <button
          onClick={() => setProgramaSelecionado("")}
          className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
            !programaSelecionado ? "border-brand-light bg-brand-light/10" : "border-black/10 hover:bg-black/[0.02]"
          }`}
        >
          <span className="block font-semibold text-brand-dark">Todos os programas</span>
          <span className="text-xs text-brand-dark/80">{escolas.length} escolas</span>
        </button>
        {programas.map((p) => (
          <button
            key={p.nome}
            onClick={() => setProgramaSelecionado(p.nome === programaSelecionado ? "" : p.nome)}
            className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
              programaSelecionado === p.nome ? "bg-black/[0.03] ring-2" : "border-black/10 hover:bg-black/[0.02]"
            }`}
            style={programaSelecionado === p.nome ? { borderColor: corDoPrograma(p.nome), ["--tw-ring-color" as any]: `${corDoPrograma(p.nome)}33` } : undefined}
          >
            <span className="flex items-center gap-1.5 font-semibold text-brand-dark">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: corDoPrograma(p.nome) }} />
              {p.nome}
            </span>
            <span className="text-xs text-brand-dark/80">
              {p.escolas} {p.escolas === 1 ? "escola" : "escolas"} · {p.acoes} {p.acoes === 1 ? "ação" : "ações"}
            </span>
          </button>
        ))}
      </div>

      {!semMapa && (
        <MapaEscolas
          escolas={escolasVisiveis}
          corDoPrograma={corDoPrograma}
          programaSelecionado={programaSelecionado}
        />
      )}
      {!semMapa && semLocalizacao > 0 && (
        <p className="px-5 -mt-2 text-xs text-brand-dark/75">
          {semLocalizacao} {semLocalizacao === 1 ? "escola não tem" : "escolas não têm"} localização cadastrada e não
          {semLocalizacao === 1 ? " aparece" : " aparecem"} no mapa.
        </p>
      )}

      {/* Lista das escolas */}
      <div className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {listaExibida.map((escola) => (
            <div key={escola.id} className="rounded-lg border border-black/5 bg-brand-light/[0.03] px-3 py-2.5">
              <p className="text-sm font-semibold text-brand-dark leading-snug">{escola.nome}</p>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {escola.programas.map((p) => (
                  <span
                    key={p.nome}
                    className="text-xs px-2 py-0.5 rounded-full text-white"
                    style={{ background: corDoPrograma(p.nome) }}
                  >
                    {p.nome} · {p.acoes}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        {escolasVisiveis.length > 12 && (
          <button
            onClick={() => setMostrarTodas((v) => !v)}
            className="mt-3 text-sm font-medium text-brand-light hover:underline"
          >
            {mostrarTodas ? "Mostrar menos" : `Ver todas as ${escolasVisiveis.length} escolas`}
          </button>
        )}
      </div>
    </div>
  );
}

function MapaEscolas({
  escolas,
  corDoPrograma,
  programaSelecionado,
}: {
  escolas: EscolaParticipanteGaleria[];
  corDoPrograma: (nome: string) => string;
  programaSelecionado: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<any>(null);
  const camadaRef = useRef<any>(null);
  const [erro, setErro] = useState(false);
  const comLocal = useMemo(() => escolas.filter((e) => e.latitude != null && e.longitude != null), [escolas]);

  useEffect(() => {
    let cancelado = false;
    carregarLeaflet()
      .then((L) => {
        if (cancelado || !ref.current) return;
        if (!mapaRef.current) {
          mapaRef.current = L.map(ref.current, { scrollWheelZoom: false });
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap contributors",
            maxZoom: 19,
          }).addTo(mapaRef.current);
        }
        const mapa = mapaRef.current;
        camadaRef.current?.remove();
        const camada = L.layerGroup().addTo(mapa);
        camadaRef.current = camada;

        const pontos: [number, number][] = [];
        comLocal.forEach((e) => {
          const ponto: [number, number] = [e.latitude!, e.longitude!];
          pontos.push(ponto);
          const programaCor = programaSelecionado || e.programas[0]?.nome || "";
          // Bolinha desenhada (não usa imagem de marcador — antes aparecia "Mark" quebrado)
          L.circleMarker(ponto, {
            radius: 8,
            color: "#ffffff",
            weight: 2,
            fillColor: corDoPrograma(programaCor),
            fillOpacity: 0.95,
          })
            .addTo(camada)
            .bindPopup(
              `<strong>${escaparHtml(e.nome)}</strong><br/>` +
                e.programas.map((p) => `${escaparHtml(p.nome)}: ${p.acoes} ${p.acoes === 1 ? "ação" : "ações"}`).join("<br/>")
            );
        });

        if (pontos.length) mapa.fitBounds(pontos, { padding: [30, 30], maxZoom: 14 });
        else mapa.setView([-5.2, -39.5], 7);
        setTimeout(() => mapa.invalidateSize(), 50);
      })
      .catch(() => setErro(true));
    return () => {
      cancelado = true;
    };
  }, [comLocal, corDoPrograma, programaSelecionado]);

  useEffect(() => () => {
    mapaRef.current?.remove();
    mapaRef.current = null;
  }, []);

  if (erro) return <p className="px-5 py-4 text-sm text-brand-dark/75">Não consegui carregar o mapa.</p>;
  return (
    <div className="p-5">
      <div ref={ref} className="w-full h-72 sm:h-96 rounded-lg overflow-hidden border border-black/5" />
    </div>
  );
}
