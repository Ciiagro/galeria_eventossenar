import { supabaseBrowser } from "./supabaseBrowserClient";

// Em produção (deploy único no Vercel), deixe NEXT_PUBLIC_API_BASE_URL vazio:
// frontend e funções Python ficam na mesma origem, então "/api/..." já funciona.
// Rodando o backend como Flask local (python app.py, porta separada), aponte para
// http://localhost:5000 no seu .env.local.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGet(path: string) {
  const headers = await authHeader();
  const res = await fetch(API_BASE + path, { headers });
  if (!res.ok) throw new Error((await res.json()).error ?? `Erro ${res.status}`);
  return res.json();
}

export async function apiPost(path: string, body: unknown) {
  const headers = await authHeader();
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? `Erro ${res.status}`);
  return res.json();
}

export async function apiUpload(formData: FormData) {
  const headers = await authHeader();
  const res = await fetch(API_BASE + "/api/upload", { method: "POST", headers, body: formData });
  if (!res.ok) throw new Error((await res.json()).error ?? `Erro ${res.status}`);
  return res.json();
}

const TAMANHO_PEDACO = 4 * 1024 * 1024; // 4MB — bem abaixo do limite de ~4.5MB do Vercel

/**
 * Sobe o arquivo em pedaços pequenos, através do nosso próprio backend
 * (que repassa cada pedaço pro Google Drive). Isso evita dois problemas
 * de uma vez: o limite de ~4.5MB por requisição do Vercel (cada pedaço
 * fica bem abaixo disso) e o bloqueio de CORS que acontece se o
 * navegador tentar falar direto com o Google.
 */
export async function apiUploadDireto(
  arquivo: File,
  municipioId: string,
  tipoDocumento: string,
  onProgresso?: (percentual: number) => void
): Promise<{ drive_file_id: string; drive_file_link: string }> {
  const { upload_url } = await apiPost("/api/upload-iniciar", {
    municipio_id: municipioId,
    tipo_documento: tipoDocumento,
    filename: arquivo.name,
    mime_type: arquivo.type || "application/octet-stream",
  });

  const headers = await authHeader();
  const total = arquivo.size;
  let enviado = 0;

  while (enviado < total) {
    const fim = Math.min(enviado + TAMANHO_PEDACO, total);
    const pedaco = arquivo.slice(enviado, fim);

    const res = await fetch(API_BASE + "/api/upload-pedaco", {
      method: "POST",
      headers: {
        ...headers,
        "Content-Range": `bytes ${enviado}-${fim - 1}/${total}`,
        "X-Drive-Upload-Url": upload_url,
        "Content-Type": "application/octet-stream",
      },
      body: pedaco,
    });

    if (!res.ok) {
      throw new Error((await res.json().catch(() => null))?.error ?? `Erro ${res.status} ao enviar o arquivo.`);
    }

    const resultado = await res.json();
    enviado = fim;
    onProgresso?.(Math.round((enviado / total) * 100));

    if (resultado.concluido) {
      return { drive_file_id: resultado.id, drive_file_link: resultado.webViewLink };
    }
  }

  throw new Error("O upload terminou sem confirmação do Google Drive.");
}

export async function apiDelete(path: string) {
  const headers = await authHeader();
  const res = await fetch(API_BASE + path, { method: "DELETE", headers });
  if (!res.ok) throw new Error((await res.json()).error ?? `Erro ${res.status}`);
  return res.json();
}

// Tipos compartilhados com o backend (mantidos simples de propósito)
export type Municipio = {
  id: number;
  nome: string;
  responsavel_id?: string | null;
  responsavel_nome?: string | null;
  responsavel_email?: string | null;
  periodo?: number;
  total_documentos?: number;
  aprovados?: number;
  pendentes?: number;
  progresso_pct?: number;
};

export type Perfil = { role: "admin" | "municipio" | null; municipio_id?: number | null; nome?: string | null; email?: string | null };

export type TipoDocumento = { id: string; nome: string };

export type Projeto = { id: string; nome: string; descricao?: string };

export type Escola = {
  id: string;
  municipio_id: number;
  nome: string;
  tipo?: string;
  endereco?: string;
  latitude?: number;
  longitude?: number;
};

export type EscolaParticipanteGaleria = {
  id: string;
  nome: string;
  latitude: number | null;
  longitude: number | null;
  programas: { nome: string; acoes: number }[];
  acoes: number;
};

export type RankingMunicipio = { municipio_id: number; nome: string; total: number };

export type ResumoDashboard = {
  indicadores: {
    municipios_total: number;
    municipios_participantes: number;
    escolas_total: number;
    escolas_participantes: number;
    documentos_total: number;
    documentos_aprovados: number;
    documentos_pendentes: number;
    documentos_rejeitados: number;
    progresso_aprovacao: number;
  };
  municipios: Array<Municipio & { periodo?: number; rejeitados: number; escolas_total: number; escolas_participantes: number }>;
  ranking_municipios: Array<Municipio & { periodo?: number; rejeitados: number; escolas_total: number; escolas_participantes: number }>;
  ranking_tipos: Array<{ nome: string; total: number }>;
  tipos_por_periodo?: Record<string, Record<string, number>>;
  tipos_por_municipio: Record<string, Record<string, number>>;
  anos_disponiveis?: number[];
  escolas_participantes_lista: EscolaParticipante[];
};

export type EscolaParticipante = {
  id: string;
  nome: string;
  municipio_id: number;
  municipio_nome: string | null;
  programas: string[];
  latitude: number | null;
  longitude: number | null;
  documentos: number;
};

export type DocumentoGaleria = {
  id: string;
  municipio_id?: number;
  tipo_id: string;
  descricao?: string;
  data_realizacao: string;
  drive_file_link?: string;
  link_externo?: string;
  visualizacoes: number;
  curtidas: number;
  tipos_documento?: { nome: string };
  escolas?: { nome: string };
  projetos?: { nome: string };
};

export type Documento = {
  id: string;
  municipio_id: number;
  tipo_id: string;
  finalidade?: string;
  acao_evento?: string;
  escola_id?: string;
  projeto_id?: string;
  descricao?: string;
  data_realizacao: string;
  responsavel_nome?: string;
  responsavel_email?: string;
  status: "pendente" | "aprovado" | "rejeitado";
  motivo_rejeicao?: string | null;
  drive_file_link?: string;
  link_externo?: string;
  na_galeria?: boolean;
  descricao_galeria?: string | null;
  publicado_galeria_em?: string | null;
  tipos_documento?: { nome: string };
  escolas?: { nome: string; endereco?: string };
  projetos?: { nome: string };
};
