-- ============================================================
-- Seed de teste: liga um município já existente em sindicatos.municipios
-- (chave: cod_ibge) aos campos extras que nosso sistema precisa
-- (drive_folder_id, periodo).
-- Rode isso no SQL Editor do Supabase, depois de já ter rodado schema.sql.
-- ============================================================

-- 1. Veja os municípios que já existem e copie o "cod_ibge" de um deles:
select cod_ibge, nome from sindicatos.municipios limit 10;

-- 2. Cole o cod_ibge copiado no lugar de COD_IBGE_AQUI abaixo e rode:
insert into trab_divulgados.municipios_extra (municipio_id, periodo, drive_folder_id)
values (COD_IBGE_AQUI, 2026, 'COLOQUE_AQUI_O_ID_DA_PASTA_DO_DRIVE')
on conflict (municipio_id) do update
  set periodo = excluded.periodo,
      drive_folder_id = excluded.drive_folder_id;

-- 3. (Opcional) Criar uma escola de teste vinculada a esse mesmo município:
-- insert into trab_divulgados.escolas (municipio_id, nome, tipo)
-- values (COD_IBGE_AQUI, 'EEEP José da Silva', 'EEEP');
