-- Termo de Adesão assinado digitalmente (PDF anexado pelo coordenador antes de enviar a adesão).
-- O arquivo fica no Google Drive (pasta do município > "Termo de Adesão"), SEM link público;
-- aqui guardamos só a referência. O hash identifica os dados da ficha no momento da assinatura:
-- se a ficha mudar depois, o termo assinado deixa de valer e precisa ser refeito.
alter table trab_divulgados.adesoes
  add column if not exists termo_assinado_drive_id text,
  add column if not exists termo_assinado_nome text,
  add column if not exists termo_assinado_em timestamptz,
  add column if not exists termo_assinado_hash text;

notify pgrst, 'reload schema';
