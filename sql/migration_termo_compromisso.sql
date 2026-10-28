-- ============================================================
-- Projeto Valores Humanos — TERMO DE COMPROMISSO DO COORDENADOR
--                         + ATIVAR / DESATIVAR COORDENADOR
---- Rode UMA VEZ no SQL Editor do Supabase (pode rodar de novo sem problema).
-- ============================================================

-- 1) Acesso ativo / desativado (o administrador liga e desliga em Coordenadores)
alter table trab_divulgados.perfis add column if not exists ativo boolean not null default true;

-- 2) Termo de compromisso: um por coordenador em cada edição (ciclo)
create table if not exists trab_divulgados.compromissos (
  id uuid primary key default gen_random_uuid(),
  ciclo_id uuid not null references trab_divulgados.ciclos(id) on delete cascade,
  coordenador_id uuid not null references auth.users(id) on delete cascade,
  municipio_id bigint,
  nome text,
  cpf text,
  email text,
  texto_hash text,                 -- identifica a versão do texto que foi assinada
  snapshot jsonb,                  -- cópia do termo como foi lido e assinado
  codigo_hash text,
  codigo_expira_em timestamptz,
  codigo_tentativas int not null default 0,
  codigo_enviado_em timestamptz,
  assinado_em timestamptz,
  ip text,
  user_agent text,
  pdf_drive_id text,
  pdf_nome text,
  created_at timestamptz not null default now(),
  unique (ciclo_id, coordenador_id)
);

-- só o servidor (service key) mexe nesta tabela
alter table trab_divulgados.compromissos enable row level security;
grant all on trab_divulgados.compromissos to service_role;

notify pgrst, 'reload schema';
