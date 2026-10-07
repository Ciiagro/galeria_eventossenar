import { supabaseBrowser } from "./supabaseBrowserClient";

// Em produção (deploy único no Vercel), deixe NEXT_PUBLIC_API_BASE_URL vazio:
// frontend e funções Python ficam na mesma origem, então "/api/..." já funciona.
// Rodando o backend como Flask local (python app.py, porta separada), aponte para
// http://localhost:5000 no seu .env.local.
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

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

// GET com cache curto em memória. Várias partes da tela pedem o mesmo dado ao abrir
// (ex.: a barra lateral e a página pedem /api/perfil e /api/ciclos): aqui as chamadas
// iguais viram uma só, e a resposta é reaproveitada por `ttlMs`.
const _cacheGet = new Map<string, { em: number; valor?: unknown; promessa?: Promise<unknown> }>();

export function apiGetCache(path: string, ttlMs = 60_000): Promise<any> {
  const agora = Date.now();
  const item = _cacheGet.get(path);
  if (item?.promessa) return item.promessa;
  if (item && "valor" in item && agora - item.em < ttlMs) return Promise.resolve(item.valor);
  const promessa = apiGet(path).then(
    (valor) => { _cacheGet.set(path, { em: Date.now(), valor }); return valor; },
    (erro) => { _cacheGet.delete(path); throw erro; }
  );
  _cacheGet.set(path, { em: agora, promessa });
  return promessa;
}

/** Esquece só as respostas guardadas cujo caminho começa com `prefixo` (ex.: "/api/galeria"). */
export function esquecerCacheApiPor(prefixo: string) {
  Array.from(_cacheGet.keys()).forEach((k) => { if (k.startsWith(prefixo)) _cacheGet.delete(k); });
}

/** Esquece o que foi guardado (use ao trocar de conta). */
export function limparCacheApi() {
  _cacheGet.clear();
}

// Trocou de pessoa (sair/entrar com outra conta)? Então nada do cache vale mais.
if (typeof window !== "undefined") {
  let ultimoUsuario: string | null | undefined;
  supabaseBrowser.auth.onAuthStateChange((_evento, sessao) => {
    const id = sessao?.user?.id ?? null;
    if (ultimoUsuario !== undefined && id !== ultimoUsuario) limparCacheApi();
    ultimoUsuario = id;
  });
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

export async function apiPut(path: string, body: unknown) {
  const headers = await authHeader();
  const res = await fetch(API_BASE + path, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Erro ${res.status}`);
  return res.json();
}

// Envia um formulário com arquivo para qualquer rota (ex.: termo assinado em PDF)
export async function apiPostForm(path: string, formData: FormData) {
  const headers = await authHeader();
  const res = await fetch(API_BASE + path, { method: "POST", headers, body: formData });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Erro ${res.status}`);
  return res.json();
}

// Abre numa nova aba um arquivo protegido (precisa do login, então não dá para usar um link comum).
// Passe `janela` aberta no clique (window.open("", "_blank")) para o navegador não bloquear.
export async function apiAbrirArquivo(path: string, janela?: Window | null) {
  const aba = janela ?? window.open("", "_blank");
  try {
    const headers = await authHeader();
    const res = await fetch(API_BASE + path, { headers });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Erro ${res.status}`);
    const url = URL.createObjectURL(await res.blob());
    if (aba) aba.location.href = url;
    else window.location.href = url;
  } catch (e) {
    aba?.close();
    throw e;
  }
}

// Baixa um arquivo protegido para o computador (precisa do login, então não dá para usar um link comum)
export async function apiBaixarArquivo(path: string, nomeArquivo: string) {
  const headers = await authHeader();
  const res = await fetch(API_BASE + path, { headers });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Erro ${res.status}`);
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
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

// Perfis de acesso:
//  admin               -> Administrador
//  municipio           -> Coordenador Geral por Município (1 município)
//  apoiador_visitas    -> Apoiador de Visitas (municípios definidos pelo admin)
//  apoiador_relatorios -> Apoiador de Relatórios (municípios definidos pelo admin; analisa os documentos)
export type Papel = "admin" | "municipio" | "apoiador_visitas" | "apoiador_relatorios";

export const ROTULO_PAPEL: Record<Papel, string> = {
  admin: "Administrador",
  municipio: "Coordenador Geral por Município",
  apoiador_visitas: "Apoiador de Visitas",
  apoiador_relatorios: "Apoiador de Relatórios",
};

export type Perfil = {
  role: Papel | null;
  municipio_id?: number | null;
  municipio_nome?: string | null; // nome do município (já liberado ou escolhido no cadastro)
  municipio_pendente?: boolean; // coordenador cujo município só será liberado após a aprovação da adesão
  municipio_ids?: number[] | null; // municípios em que atua (null = todos)
  nome?: string | null;
  email?: string | null;
};

// Quem escolhe o município na tela (em vez de ter um só fixo)
export const escolheMunicipio = (role?: Papel | null) =>
  role === "admin" || role === "apoiador_visitas" || role === "apoiador_relatorios";

export type MembroEquipe = {
  id: string;
  nome: string;
  email: string | null;
  role: "apoiador_visitas" | "apoiador_relatorios";
  municipio_ids: number[];
};

export type TipoDocumento = { id: string; nome: string };

// "Projeto" no banco = "Valor" na tela (Paz, Amor, Verdade, Ação correta, Não violência)
export type Projeto = { id: string; nome: string; descricao?: string; cor?: string | null; ordem?: number | null };

// Ação pedagógica (Acolhimento, Meditação, Hora do Conto...). A linha com exige_pdf = true é o grupo
// "Documentos" (relatórios, ficha de frequência, portfólio): não é uma ação pedagógica.
export type AcaoPedagogica = { id: string; nome: string; ordem?: number | null; exige_pdf?: boolean; subtipos?: string[] | null };

export type DocumentoResumo = { nome: string; total: number; aprovados?: number };

export type AcaoResumo = { id: string; nome: string; ordem?: number | null; total: number; aprovados?: number };

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
  municipio_id?: number;
  latitude: number | null;
  longitude: number | null;
  programas: { nome: string; acoes: number; cor?: string | null }[];
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
  por_acao?: AcaoResumo[];
  por_documento?: DocumentoResumo[];
  sem_acao?: number;
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
  escola_id?: string | null;
  projeto_id?: string | null;
  acao_evento?: string | null;
  drive_file_id?: string | null;
  publicado_galeria_em?: string | null;
  descricao?: string;
  data_realizacao: string;
  drive_file_link?: string;
  link_externo?: string;
  visualizacoes: number;
  curtidas: number;
  subtipo?: string | null;
  tipos_documento?: { nome: string };
  escolas?: { nome: string };
  projetos?: { nome: string; cor?: string | null };
  acoes_pedagogicas?: { nome: string } | null;
};

// Documentos (PDF: relatórios, ficha de frequência, portfólio) não passam por aprovação do administrador
export const ehDocumentoPdf = (d: { acoes_pedagogicas?: { exige_pdf?: boolean } | null }) => Boolean(d.acoes_pedagogicas?.exige_pdf);

export type Documento = {
  id: string;
  municipio_id: number;
  tipo_id: string;
  finalidade?: string;
  acao_evento?: string;
  escola_id?: string;
  projeto_id?: string;
  ciclo_id?: string | null;
  acao_pedagogica_id?: string | null;
  subtipo?: string | null;
  descricao?: string;
  data_realizacao: string;
  responsavel_nome?: string;
  responsavel_email?: string;
  status: "pendente" | "aprovado" | "rejeitado";
  motivo_rejeicao?: string | null;
  arquivado?: boolean;
  arquivado_em?: string | null;
  validado_por?: string | null;
  validado_por_nome?: string | null;
  validado_em?: string | null;
  origem?: "municipio" | "visita" | "apoio_relatorios" | "admin" | null;
  analise_status?: "recomendado" | "ajustes" | null;
  analise_obs?: string | null;
  analise_por_nome?: string | null;
  analise_em?: string | null;
  created_at?: string;
  drive_file_id?: string | null;
  drive_file_link?: string;
  link_externo?: string;
  na_galeria?: boolean;
  descricao_galeria?: string | null;
  publicado_galeria_em?: string | null;
  tipos_documento?: { nome: string };
  escolas?: { nome: string; endereco?: string };
  projetos?: { nome: string; cor?: string | null };
  acoes_pedagogicas?: { nome: string; exige_pdf?: boolean } | null;
};

// Canal de Comunicação (comunicados do administrador)
// Todos os públicos recebem por e-mail. Coordenadores e equipe de apoio (que têm login) também veem dentro do
// sistema; secretários de educação (sem login) recebem só por e-mail.
export type ResumoEnvio = { total: number; enviados: number; erros: number; pendentes: number };
export type Comunicado = {
  id: string;
  titulo: string;
  mensagem: string;
  link?: string | null;
  para_coordenadores: boolean;
  para_apoiadores: boolean;
  para_secretarios: boolean;
  fixado: boolean;
  criado_por_nome?: string | null;
  criado_em: string;
  atualizado_em?: string | null;
  lido?: boolean; // para quem recebe dentro do sistema
  destinatarios?: number; // só para o administrador (quem lê dentro do sistema)
  lidos?: number; // só para o administrador
  emails?: ResumoEnvio; // só para o administrador: andamento do envio dos e-mails
};
export type LeituraComunicado = { nome: string; role: Papel | null; municipio?: string | null; lido: boolean; lido_em?: string | null };
export type EnvioEmail = {
  tipo: "coordenador" | "apoiador" | "secretario";
  nome?: string | null;
  municipio?: string | null;
  email: string;
  status: "pendente" | "enviado" | "erro";
  erro?: string | null;
  enviado_em?: string | null;
};
