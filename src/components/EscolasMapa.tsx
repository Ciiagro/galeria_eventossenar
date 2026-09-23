"use client";

import { useEffect, useRef, useState } from "react";
import { Escola } from "@/lib/api";

const LEAFLET_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css";
const LEAFLET_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js";

export function carregarLeaflet(): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = window as any;
    if (w.L) return resolve(w.L);

    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }

    const existente = document.querySelector(`script[src="${LEAFLET_JS}"]`);
    if (existente) {
      existente.addEventListener("load", () => resolve(w.L));
      return;
    }

    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.onload = () => resolve(w.L);
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

export function EscolasMapa({ escolas }: { escolas: Escola[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<any>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!escolas.length || !ref.current) return;

    let cancelado = false;

    carregarLeaflet()
      .then((L) => {
        if (cancelado || !ref.current) return;

        if (mapaRef.current) {
          mapaRef.current.remove();
        }

        const mapa = L.map(ref.current);
        mapaRef.current = mapa;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        }).addTo(mapa);

        const pontos: [number, number][] = [];
        escolas.forEach((e) => {
          if (e.latitude == null || e.longitude == null) return;
          const ponto: [number, number] = [e.latitude, e.longitude];
          pontos.push(ponto);
          L.marker(ponto).addTo(mapa).bindPopup(e.nome);
        });

        if (pontos.length) {
          mapa.fitBounds(pontos, { padding: [30, 30], maxZoom: 14 });
        } else {
          mapa.setView([-5.2, -39.5], 7); // centro aproximado do Ceará
        }
      })
      .catch(() => setErro("Não consegui carregar o mapa."));

    return () => {
      cancelado = true;
      if (mapaRef.current) {
        mapaRef.current.remove();
        mapaRef.current = null;
      }
    };
  }, [escolas]);

  if (!escolas.length) return null;

  return (
    <div className="rounded-xl overflow-hidden border border-black/5 bg-white">
      <div className="px-4 py-3 border-b border-black/5">
        <p className="text-sm font-medium text-brand-dark">Escolas atendidas</p>
      </div>
      {erro ? (
        <p className="p-4 text-xs text-brand-dark/75">{erro}</p>
      ) : (
        <div ref={ref} className="w-full h-64 sm:h-80" />
      )}
    </div>
  );
}
