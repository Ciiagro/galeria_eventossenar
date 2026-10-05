"use client";

import { useState } from "react";
import { apiPut, Escola } from "@/lib/api";

// Edição de dados da escola (nome, tipo, endereço, latitude/longitude).
// Usado na tela Escolas e na Ficha de adesão — um só formulário, o mesmo comportamento.

export const TIPOS_ESCOLA = ["Municipal", "Estadual", "Privada", "Federal"];
export const CAMPO =
  "w-full border border-black/10 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-light/30";

// Limites do Ceará (com folga) — usados só para pegar erros de digitação
// (sinal de menos esquecido, latitude e longitude trocadas...).
export const CE = { latMin: -8.0, latMax: -2.5, lonMin: -41.6, lonMax: -37.0 };

// ---------- ajudantes ----------
export const numero = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
export const temCoordenadas = (e: Escola) => numero(e.latitude) !== null && numero(e.longitude) !== null;
export const temEndereco = (e: Escola) => (e.endereco ?? "").trim().length > 0;
export const estaCompleta = (e: Escola) => temCoordenadas(e) && temEndereco(e);

export function paraTexto(v: unknown) {
  const n = numero(v);
  return n === null || Number.isNaN(n) ? "" : String(n);
}

export function lerNumero(texto: string): number | null {
  const limpo = texto.trim().replace(",", ".");
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : NaN;
}

// O Google Maps copia "-3.432100, -40.123400". Se a pessoa colar isso no campo
// de latitude, separamos nos dois campos.
export function separarPar(texto: string): [string, string] | null {
  const m =
    texto.match(/^\s*(-?\d+[.,]\d+)\s*[;,]?\s+(-?\d+[.,]\d+)\s*$/) ?? texto.match(/^\s*(-?\d+\.\d+),(-?\d+\.\d+)\s*$/);
  return m ? [m[1].replace(",", "."), m[2].replace(",", ".")] : null;
}

export function validarCoordenadas(lat: string, lon: string): string | null {
  const la = lerNumero(lat);
  const lo = lerNumero(lon);
  if (la === null && lo === null) return null; // as duas vazias = sem localização
  if (la === null || lo === null) return "Preencha latitude e longitude juntas.";
  if (Number.isNaN(la) || Number.isNaN(lo)) return "Use apenas números. Exemplo: -3.432100";
  if (la < CE.latMin || la > CE.latMax || lo < CE.lonMin || lo > CE.lonMax) {
    return "Essa posição fica fora do Ceará. Confira o sinal de menos (-) e se latitude e longitude não estão trocadas.";
  }
  return null;
}

export function linkGoogleMaps(e: Escola, lat: string, lon: string, endereco: string) {
  const la = lerNumero(lat);
  const lo = lerNumero(lon);
  const consulta =
    la !== null && lo !== null && !Number.isNaN(la) && !Number.isNaN(lo)
      ? `${la},${lo}`
      : `${e.nome} ${endereco} Ceará`.trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta)}`;
}

// ================================================================
// Formulário de edição (nome, tipo, endereço + latitude/longitude)
// ================================================================
export function FormularioEscola({
  escola,
  onCancelar,
  onSalvo,
  endpoint = "/api/escolas",
}: {
  escola: Escola;
  onCancelar: () => void;
  onSalvo: (e: Escola) => void;
  /** rota que grava a escola (a ficha de adesão usa uma própria, para coordenador ainda não liberado) */
  endpoint?: string;
}) {
  const inicial = { nome: escola.nome ?? "", tipo: escola.tipo ?? "", endereco: escola.endereco ?? "", lat: paraTexto(escola.latitude), lon: paraTexto(escola.longitude) };
  const [nome, setNome] = useState(inicial.nome);
  const [tipo, setTipo] = useState(inicial.tipo);
  const [endereco, setEndereco] = useState(inicial.endereco);
  const [lat, setLat] = useState(inicial.lat);
  const [lon, setLon] = useState(inicial.lon);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const problemaCoord = validarCoordenadas(lat, lon);
  const problemaNome = nome.trim().length < 3 ? "Informe o nome da escola (mínimo de 3 letras)." : null;
  const problema = problemaNome ?? problemaCoord;
  const alterou =
    nome.trim() !== inicial.nome.trim() ||
    tipo !== inicial.tipo ||
    endereco.trim() !== inicial.endereco.trim() ||
    lerNumero(lat) !== lerNumero(inicial.lat) ||
    lerNumero(lon) !== lerNumero(inicial.lon);

  function aoMudarLatitude(texto: string) {
    const par = separarPar(texto);
    if (par) {
      setLat(par[0]);
      setLon(par[1]);
    } else {
      setLat(texto);
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (problema || !alterou) return;
    setSalvando(true);
    setErro(null);
    try {
      const atualizada: Escola = await apiPut(endpoint, {
        id: escola.id,
        nome: nome.trim(),
        tipo,
        endereco: endereco.trim(),
        latitude: lerNumero(lat),
        longitude: lerNumero(lon),
      });
      onSalvo(atualizada);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
      setSalvando(false);
    }
  }

  return (
    <form
      onSubmit={salvar}
      onKeyDown={(e) => e.key === "Escape" && onCancelar()}
      className="mt-4 border-t border-black/10 pt-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3 mb-4">
        <div>
          <label htmlFor={`nome-${escola.id}`} className="block text-sm font-medium text-brand-dark mb-1.5">Nome da escola</label>
          <input id={`nome-${escola.id}`} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} className={CAMPO} />
        </div>
        <div>
          <label htmlFor={`tipo-${escola.id}`} className="block text-sm font-medium text-brand-dark mb-1.5">Tipo</label>
          <select id={`tipo-${escola.id}`} value={tipo} onChange={(e) => setTipo(e.target.value)} className={CAMPO}>
            <option value="">Não informado</option>
            {[...TIPOS_ESCOLA, ...(tipo && !TIPOS_ESCOLA.includes(tipo) ? [tipo] : [])].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      <label htmlFor={`end-${escola.id}`} className="block text-sm font-medium text-brand-dark mb-1.5">
        Endereço
      </label>
      <textarea
        id={`end-${escola.id}`}
        value={endereco}
        onChange={(e) => setEndereco(e.target.value)}
        rows={2}
        maxLength={300}
        placeholder="Rua, número, bairro ou localidade, CEP"
        className={CAMPO}
      />

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
        <div>
          <label htmlFor={`lat-${escola.id}`} className="block text-sm font-medium text-brand-dark mb-1.5">Latitude</label>
          <input
            id={`lat-${escola.id}`}
            value={lat}
            onChange={(e) => aoMudarLatitude(e.target.value)}
            inputMode="decimal"
            placeholder="-3.432100"
            className={CAMPO}
          />
        </div>
        <div>
          <label htmlFor={`lon-${escola.id}`} className="block text-sm font-medium text-brand-dark mb-1.5">Longitude</label>
          <input
            id={`lon-${escola.id}`}
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            inputMode="decimal"
            placeholder="-40.123400"
            className={CAMPO}
          />
        </div>
      </div>

      <p className="mt-2 text-xs text-brand-dark/75 max-w-xl">
        Dica: no Google Maps, clique com o botão direito no local da escola e clique nos números que aparecem para copiar.
        Depois cole no campo Latitude — os dois campos são preenchidos de uma vez.
      </p>
      <a
        href={linkGoogleMaps(escola, lat, lon, endereco)}
        target="_blank"
        rel="noreferrer"
        className="mt-1.5 inline-block text-sm font-semibold text-brand-light hover:underline"
      >
        {problemaCoord === null && lat.trim() && lon.trim() ? "Conferir no Google Maps ↗" : "Procurar no Google Maps ↗"}
      </a>

      {problema && (
        <p className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">⚠️ {problema}</p>
      )}
      {erro && <p className="mt-3 rounded-lg bg-status-pendente/10 px-3 py-2 text-sm text-status-pendente">{erro}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancelar}
          disabled={salvando}
          className="px-3 py-2 rounded-lg border border-black/10 text-sm font-medium text-brand-dark/85 hover:bg-brand-light/5 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={salvando || Boolean(problema) || !alterou}
          className="px-4 py-2 rounded-lg bg-status-completo text-white text-sm font-semibold disabled:opacity-50"
        >
          {salvando ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </form>
  );
}
