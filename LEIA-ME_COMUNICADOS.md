# Canal de Comunicação + novos nomes (Aguardando Validação / Validados)

## 1) O que mudou
**Nomes na tela**
- "Para revisar" -> **Aguardando Validação** (abas, indicadores, selo de status, painel inicial)
- "Aprovados" -> **Validados** (abas, tabela do painel inicial); "Aprovado por Fulana" -> "Validado por Fulana"
- "Revisar documentos" -> "Validar documentos"; "ações aprovadas" -> "ações validadas"
- "Material Instrucional" -> **Material Pedagógico**
- NÃO mudou (de propósito): o valor interno `aprovado` no banco, o fluxo de adesão (termo/ficha), os botões "Aprovar documento" e o título "Painel de Aprovação".

**Canal de Comunicação (novo)**: item "Comunicados" no menu de todos os perfis.
Ao criar um comunicado, o administrador marca **um ou mais** públicos. **Todos recebem por e-mail**:

| Público | No sistema | Por e-mail |
|---|---|---|
| Coordenadores | sim (aparece "Novo", contador no menu, controle de quem leu) | sim |
| Equipe de apoio | sim | sim |
| Secretários de educação | **não** (não têm login) | sim |

- O e-mail dos coordenadores e da equipe de apoio avisa que o comunicado também está no sistema (com link).
- Secretários: vêm da **ficha de adesão** (enviada ou aprovada) da edição ativa; só e-mails válidos, cada endereço uma vez. O sistema não sabe se o secretário leu, só se o e-mail foi enviado.
- O envio é em lotes, com barra de progresso. Cada pessoa fica registrada (enviado / erro): dá para "Continuar envio" e "Reenviar os que falharam". Ninguém recebe duas vezes.
- O administrador vê, em cada comunicado: "Lido no sistema por X de Y", o andamento dos e-mails e a lista detalhada (quem leu, quem não leu, status de cada e-mail).

## 2) Como instalar (nesta ordem)
1. **Banco:** no SQL Editor do Supabase (projeto do schema `trab_divulgados`), rode `sql/migration_comunicados.sql`. Pode rodar mais de uma vez; ele atualiza quem já tinha rodado versões anteriores.
2. **Arquivos:** extraia este zip por cima do projeto (substituir). Se você alterou o `app.py` depois de me enviar o projeto, não substitua o `app.py`: siga o passo a passo no topo de `app_comunicados_trecho.py`. O `lib/email_client.py` também precisa ser substituído.
3. **E-mail:** o envio usa o mesmo e-mail dos convites de assinatura (`SMTP_USER`, `SMTP_PASSWORD` e `APP_URL` no .env e na Vercel). Se não estiver configurado, a tela avisa e o comunicado fica só no sistema.
4. **Reinicie** o backend (`python app.py`) / publique de novo na Vercel.

## 3) Observações
- Segurança no servidor: só o administrador cria/edita/exclui/envia; cada pessoa só enxerga os comunicados do seu público; as tabelas não são acessíveis direto pelo navegador.
- Limite do Gmail/Workspace: cerca de 500 e-mails por dia por conta. Um comunicado para todos usa uns 200.
- O e-mail de coordenadores e da equipe de apoio é o e-mail de login deles.
- Excluir um comunicado é definitivo (apaga também o histórico de leitura e de e-mails; e-mails já enviados não podem ser desfeitos).
- Editar um comunicado NÃO reenvia e-mail. Quem ainda não recebeu: botão "Continuar envio".
- Não há resposta dos coordenadores (canal de mão única).
