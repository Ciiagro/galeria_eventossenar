-- Prazos dos documentos das formações (o administrador edita em Edições).
-- Rode no SQL Editor do Supabase. Sem esta tabela o sistema usa as datas padrão do código.
create table if not exists trab_divulgados.prazos_documentos (
  nome text primary key,
  abre_em date not null,
  prazo date
);
alter table trab_divulgados.prazos_documentos enable row level security;
grant select, insert, update, delete on trab_divulgados.prazos_documentos to service_role;
