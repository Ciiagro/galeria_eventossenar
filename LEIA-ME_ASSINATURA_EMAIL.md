# Assinatura do Termo de Adesão por e-mail

## Como funciona
1. Na ficha, etapa **Termo assinado**, o coordenador informa o e-mail do(a) prefeito(a) e o nome e e-mail do(a) presidente do sindicato (o e-mail do coordenador vem do cadastro) e clica em **Enviar para assinatura por e-mail**.
2. Cada pessoa recebe um e-mail com um **link pessoal**. Ao abrir, lê o termo, pede um **código de 6 dígitos** (chega no mesmo e-mail, vale 15 min, 5 tentativas), digita o nome completo, marca "li e concordo" e assina.
3. Quando as 3 pessoas assinam, o sistema gera o **PDF final** (termo + folha de comprovação com data, hora, IP e navegador de cada um), salva no Drive em *município > Termo de Adesão* e preenche a adesão como se o PDF tivesse sido anexado. Os 3 recebem o PDF por e-mail.
4. O botão **Enviar adesão** e a tela do administrador funcionam como antes ("✓ Assinado").
5. Se a ficha for alterada depois do envio, o sistema avisa e o termo precisa ser enviado de novo (mesma regra do hash que já existia).
6. O jeito antigo (assinar no gov.br e anexar o PDF) continua disponível, recolhido no fim da etapa.

## Quem assina por e-mail (liberação por etapas)
- **Agora (padrão):** só o **coordenador** assina por e-mail. O e-mail dele vem do cadastro, não precisa digitar nada. O PDF final traz a assinatura eletrônica dele e linhas em branco para as demais assinaturas (prefeito, secretário de educação e presidente do sindicato), que ficam fora do sistema por enquanto.
- **Depois, para liberar prefeito, secretário de educação e presidente do sindicato (pode liberar um de cada vez, ex.: `coordenador,prefeito`):** acrescente esta linha no `.env` (e no Vercel > Environment Variables, com novo deploy) e reinicie:
```
ASSINATURA_PAPEIS=coordenador,prefeito,secretario,sindicato
```
Sem a linha, vale só o coordenador. O coordenador sempre assina. Termos já assinados continuam como estão.

## O que o administrador vê
Em **Termo de Adesão**, a aba **Em assinatura** lista os termos enviados por e-mail que ainda faltam assinar (inclusive fichas ainda em rascunho), com o selo "Assinando 1/3". Ao abrir o cartão aparece quem já assinou e quem está aguardando. O botão do PDF abre o **termo exatamente como foi enviado** (com os dados daquele momento e as assinaturas já feitas); depois que os 3 assinam, o mesmo botão abre o PDF final guardado no Drive.

## O que fazer para ativar
### 1. Banco (Supabase)
Rode `sql/migration_assinatura_email.sql` no SQL Editor (pode rodar de novo sem problema; ele também libera o papel do secretário em quem já tinha rodado a versão anterior).

### 2. Senha de app do Gmail (conta geovana@senarce.org.br)
- Entre na conta Google, vá em **Segurança** e ative a **Verificação em duas etapas** (se ainda não estiver).
- Em **Segurança > Senhas de app**, crie uma senha (nome: "Painel Valores"). O Google mostra 16 letras: copie.
- Se o domínio senarce.org.br for Google Workspace e a opção "Senhas de app" não aparecer, peça ao administrador do Workspace para liberar. Se o e-mail for de outro provedor (ex.: Microsoft 365), avise: muda só o `SMTP_HOST`/`SMTP_PORT`.

### 3. Variáveis de ambiente (arquivo `.env` local e Vercel > Settings > Environment Variables)
```
SMTP_USER=geovana@senarce.org.br
SMTP_PASSWORD=<as 16 letras da senha de app>
APP_URL=https://<endereço do seu sistema no Vercel>
# opcionais:
# SMTP_FROM_NOME=Projeto Valores Humanos - SENAR CE
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=465
```
Depois de cadastrar no Vercel, faça um novo deploy.

### 4. Teste
Use a ficha de um município de teste com 3 e-mails seus (diferentes entre si), assine nos 3 e confira o PDF no Drive e nos e-mails.

## Observações
- O e-mail sai em nome de geovana@senarce.org.br. Gmail tem limite diário de envios (centenas por dia), suficiente para este uso. Se algum e-mail cair no spam, peça para marcar como "não é spam".
- É **assinatura eletrônica simples** (Lei 14.063/2020). Confirme com o jurídico se a prefeitura exige assinatura avançada/qualificada (gov.br ou certificado); nesse caso use a opção de anexar o PDF.
- Os links são pessoais e só valem enquanto o pedido está ativo; "Reenviar" gera um link novo e invalida o anterior; "Trocar e-mail" corrige um endereço errado.
- Arquivos novos/alterados: `app.py`, `lib/email_client.py`, `lib/termo_pdf.py`, `requirements.txt` (fpdf2), `vercel.json` (inclui os logos no deploy), `app/assinar/page.tsx`, `src/components/AssinaturaEmail.tsx`, `src/components/TermoDocumento.tsx`, `app/adesao/ficha/page.tsx`, `app/layout.tsx`, `src/components/AuthGuard.tsx`.
