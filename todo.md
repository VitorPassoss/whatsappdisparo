# Painel de Disparos WhatsApp - TODO

## Banco de Dados & Backend
- [x] Schema: tabela `sessions` (token, phoneNumberId, nome, userId)
- [x] Schema: tabela `campaigns` (id, nome, mensagem, total, enviados, sucesso, erros, status, createdAt)
- [x] Schema: tabela `campaign_contacts` (id, campaignId, phone, status, errorMsg, sentAt)
- [x] Schema: tabela `contact_lists` (id, nome, userId, createdAt)
- [x] Schema: tabela `contact_list_items` (id, listId, phone, nome)
- [x] Migração SQL aplicada via drizzle-kit migrate
- [x] Router: autenticação por Token + Phone Number ID (sem OAuth)
- [x] Router: criar/listar/deletar sessões WhatsApp
- [x] Router: criar campanha e disparar mensagens em massa
- [x] Router: buscar status de campanha em tempo real (polling)
- [x] Router: listar histórico de campanhas com filtros
- [x] Router: gerenciar listas de contatos (CRUD)
- [x] Integração real com Meta WhatsApp API (endpoint messages)

## Frontend - Autenticação
- [x] Tela de login elegante com campos Token + Phone Number ID
- [x] Validação de campos e feedback de erro
- [x] Persistência de sessão via cookie/localStorage

## Frontend - Dashboard
- [x] Layout com sidebar elegante e navegação
- [x] Cards de estatísticas: Total, Enviados, Sucesso, Erros, Pendentes
- [x] Gráfico de desempenho de campanhas

## Frontend - Área de Disparo
- [x] Campo para colar múltiplos números (um por linha)
- [x] Campo para digitar a mensagem
- [x] Opção de selecionar lista de contatos salva
- [x] Botão de iniciar disparo com confirmação
- [x] Console em tempo real mostrando progresso número a número
- [x] Indicadores de status por número (enviado, sucesso, erro)

## Frontend - Histórico de Campanhas
- [x] Listagem de campanhas com data, mensagem, total, taxa de sucesso
- [x] Filtros por data, status e campanha
- [x] Busca textual
- [x] Detalhes da campanha com lista de contatos e status individual

## Frontend - Listas de Contatos
- [x] Criar lista nomeada de contatos
- [x] Adicionar/remover números de uma lista
- [x] Reutilizar lista em nova campanha
- [x] Editar nome da lista

## Qualidade & Entrega
- [x] Testes vitest para routers principais (11 testes passando)
- [x] Visual dark mode elegante e sofisticado
- [x] Responsividade em telas menores
- [x] Checkpoint final salvo

## Integração Facebook OAuth (Meta WhatsApp Business)
- [ ] Configurar Facebook App ID e App Secret via secrets
- [ ] Backend: rota GET /api/auth/facebook/login (gera URL de autorização)
- [ ] Backend: rota GET /api/auth/facebook/callback (troca code por token de longa duração)
- [ ] Backend: buscar WhatsApp Business Accounts via Graph API (/me/businesses)
- [ ] Backend: buscar Phone Number IDs via Graph API (/waba_id/phone_numbers)
- [ ] Backend: salvar sessão automaticamente com token + phoneNumberId obtidos
- [ ] Frontend: botão "Conectar com Facebook" na página de Sessões
- [ ] Frontend: página de callback /auth/facebook/callback para processar retorno
- [ ] Frontend: exibir contas/números disponíveis para selecionar e salvar como sessão
- [ ] Testes para o fluxo de callback Facebook

## Facebook Embedded Signup (BM Verificada)
- [ ] Configurar FACEBOOK_APP_ID e FACEBOOK_APP_SECRET via secrets
- [ ] Backend: rota GET /api/auth/facebook/url (gera URL OAuth com scopes whatsapp_business_management + whatsapp_business_messaging)
- [ ] Backend: rota POST /api/auth/facebook/exchange (troca code por user access token)
- [ ] Backend: converter para long-lived token via /oauth/access_token
- [ ] Backend: buscar WABAs do usuário via /me/whatsapp_business_accounts
- [ ] Backend: buscar Phone Numbers de cada WABA via /{waba_id}/phone_numbers
- [ ] Backend: salvar sessão automaticamente com token + phoneNumberId selecionado
- [ ] Frontend: botão azul "Entrar com o Facebook" na página de Sessões
- [ ] Frontend: abrir popup OAuth do Facebook (window.open) com URL gerada pelo backend
- [ ] Frontend: receber postMessage do popup com o code de autorização
- [ ] Frontend: chamar backend para trocar code e listar WABAs/números disponíveis
- [ ] Frontend: modal para selecionar qual número/WABA conectar
- [ ] Frontend: criar sessão automaticamente após seleção

## Templates Aprovados Meta WhatsApp
- [x] Backend: router templates.list — busca templates aprovados via Graph API /{waba_id}/message_templates
- [x] Backend: suporte a envio via template (type: template) com componentes header/body/footer/buttons
- [x] Backend: extrair variáveis do template ({{1}}, {{2}}, etc.) e passar no payload
- [x] Frontend: toggle "Mensagem Livre / Template" na tela de Novo Disparo
- [x] Frontend: seletor de template com busca e preview do conteúdo
- [x] Frontend: campos dinâmicos para preencher variáveis do template ({{1}}, {{2}}, ...)
- [x] Frontend: preview em tempo real da mensagem montada com as variáveis
- [x] Frontend: suporte a template com header de imagem (URL opcional)

## Facebook Embedded Signup v2
- [x] Backend: rota GET /api/auth/facebook/url (gera URL OAuth com scopes whatsapp_business_management + whatsapp_business_messaging)
- [x] Backend: rota POST /api/auth/facebook/exchange (troca code por user access token + long-lived token)
- [x] Backend: buscar WABAs do usuário via /me/whatsapp_business_accounts
- [x] Backend: buscar Phone Numbers de cada WABA via /{waba_id}/phone_numbers
- [x] Backend: salvar sessão automaticamente com token + phoneNumberId selecionado
- [x] Frontend: botão "Entrar com o Facebook" na página de Sessões
- [x] Frontend: popup OAuth do Facebook (window.open) com URL gerada pelo backend
- [x] Frontend: receber postMessage do popup com o code de autorização
- [x] Frontend: modal para selecionar qual número/WABA conectar
- [x] Frontend: criar sessão automaticamente após seleção
- [x] 11 testes vitest passando após integração

## Testes Facebook OAuth
- [x] Teste: rota /api/auth/facebook/url retorna URL válida com App ID correto
- [x] Teste: rota /api/auth/facebook/exchange retorna erro quando code inválido (17 testes passando no total)

## Página de Política de Privacidade
- [x] Criar página /privacy com política de privacidade para publicar o app Meta
- [x] Adicionar rota /privacy no App.tsx

## Melhorias na Tela de Contatos
- [x] Ao colar números na área de texto, permitir selecionar em qual lista salvar (dropdown/seletor de lista)
- [x] Importar contatos via arquivo TXT/CSV/Excel na tela de Listas de Contatos
- [x] Corrigir dialog de importação: após carregar arquivo, mostrar apenas resumo (quantidade) em vez de listar todos os números no textarea

## Proteções para evitar desabilitação de BMs
- [x] Adicionar configuração de intervalo mínimo e máximo entre mensagens (delay aleatório)
- [ ] Limitar quantidade máxima de mensagens por hora/dia por número de telefone
- [ ] Exibir alertas visuais quando os limites de segurança estiverem próximos
- [x] Adicionar pausa automática do disparo se taxa de erros for alta
- [x] Mostrar dicas de boas práticas anti-ban na tela de Novo Disparo

## Módulo de Caixa de Entrada (Inbox)
- [x] Criar tabelas no banco: conversations e messages (recebidas e enviadas)
- [x] Implementar webhook /api/webhook/whatsapp para receber mensagens do Meta
- [x] Criar rota de verificação do webhook (GET com hub.challenge)
- [x] Criar procedure inbox.list para listar conversas por sessão
- [x] Criar procedure inbox.getMessages para buscar mensagens de uma conversa
- [x] Criar procedure inbox.reply para enviar resposta a uma conversa
- [x] Criar procedure inbox.markRead para marcar conversa como lida
- [x] Criar tela Inbox.tsx com lista de conversas (esquerda) e chat (direita)
- [x] Atualizar contagem de mensagens não lidas em tempo real (polling)
- [x] Adicionar rota /inbox no App.tsx e item no menu lateral
- [x] Corrigir carregamento de templates aprovados na tela de Novo Disparo (travado em "Carregando templates...")
- [x] Validar no frontend que templates carregam corretamente após correção do wabaId
- [x] Adicionar campo de edição de wabaId na tela de Sessões para sessões legadas

## Tela de Login
- [x] Redesenhar tela de login com visual profissional e moderno (layout assimétrico, branding WhatsApp, animações sutis)

## Sistema de Cadastro e Login Próprio (Email + Senha)
- [x] Adicionar colunas passwordHash e emailVerified na tabela users (migração SQL)
- [x] Backend: procedure auth.register (email, senha, nome) com hash bcrypt
- [x] Backend: procedure auth.login (email, senha) — verifica hash, cria JWT de sessão
- [x] Backend: adaptar authenticateRequest para aceitar usuários com openId gerado internamente
- [x] Frontend: tela de Login/Cadastro com abas "Entrar" e "Criar conta"
- [x] Frontend: formulário de cadastro (nome, email, senha, confirmar senha)
- [x] Frontend: formulário de login (email, senha)
- [x] Frontend: atualizar useAuth para redirecionar para /login em vez do OAuth Manus
- [x] Frontend: validações de formulário (email válido, senha mínima 8 chars, senhas iguais)
- [x] Frontend: feedback de erro inline nos campos

## Melhorias de UI (17/04)
- [x] Dashboard: redesenhar gráfico de campanhas com visual mais bonito e chamativo (cores gradiente, tooltips estilizados, área preenchida)
- [x] Novo Disparo: remover bloco de aviso "Boas práticas para proteger sua BM" (manter apenas campos de intervalo mínimo/máximo)
- [x] Sessões: adicionar campo WABA ID no formulário de cadastro manual de nova sessão

## Correção OAuth Facebook (17/04)
- [x] Corrigir facebook-oauth.ts para usar redirect_uri dinâmico (baseado na origem do frontend) em vez de URL hardcoded
- [x] Adicionar allowlist de origens válidas para o redirect_uri do Facebook OAuth (segurança)
- [x] Atualizar testes de facebook-oauth cobrindo origin dinâmico

## Agendamento de Disparos
- [x] Schema: adicionar campo scheduledAt (timestamp nullable) na tabela campaigns
- [x] Schema: adicionar status 'scheduled' no enum de campanhas
- [x] Backend: aceitar scheduledAt no input do campaigns.send; se futuro, salva como 'scheduled' e retorna
- [x] Backend: worker scheduledWorker.ts verifica a cada 60s e executa campanhas agendadas
- [x] Frontend: toggle "Agendar para depois" no Novo Disparo
- [x] Frontend: date/time picker aparece quando toggle ativado
- [x] Frontend: mostrar campanhas agendadas no Histórico com badge "Agendado" e horário
- [x] Frontend: opção de cancelar agendamento no Histórico
- [x] Backend: procedure campaigns.cancel para cancelar campanhas agendadas
- [x] Histórico: badge 'Cancelado' para campanhas canceladas
- [x] 27 testes vitest passando

## Proteções Anti-Inspeção e Anti-Download
- [x] Bloquear clique direito (contextmenu) em toda a aplicação
- [x] Bloquear atalhos de teclado: F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+U (view-source), Ctrl+S (salvar página)
- [x] Detectar DevTools aberto e redirecionar/bloquear acesso
- [x] Desabilitar seleção de texto nas áreas sensíveis
- [x] Bloquear drag de elementos (arrastar imagens/textos)
- [x] Ofuscar código JS no build (minificação já ativa via Vite)

## Módulo de Automação / Funil de Respostas
- [x] Schema: tabela `automations` (id, sessionId, userId, name, trigger, isActive, createdAt)
- [x] Schema: tabela `automation_steps` (id, automationId, stepOrder, message, delaySeconds)
- [x] Migração SQL aplicada
- [x] Backend: procedure automations.list
- [x] Backend: procedure automations.create
- [x] Backend: procedure automations.update (ativar/desativar, editar)
- [x] Backend: procedure automations.delete
- [x] Backend: webhook processa automação ao receber mensagem que bate com trigger
- [x] Backend: registrar contatos que já receberam o funil para evitar reenvio
- [x] Frontend: página Automações com lista de funis
- [x] Frontend: modal criar/editar funil com trigger e passos (mensagens + delay)
- [x] Frontend: toggle ativar/desativar funil
- [x] Frontend: adicionar item "Automações" no menu lateral
- [x] Testes vitest para procedures de automação (27 testes passando)

## Sistema de Créditos de Disparos
- [ ] Schema: adicionar coluna `credits` (int, default 50) na tabela users
- [ ] Migração SQL aplicada
- [ ] Backend: ao registrar novo usuário, definir credits = 50
- [ ] Backend: ao iniciar disparo, verificar se user tem créditos suficientes
- [ ] Backend: deduzir 1 crédito por mensagem enviada com sucesso
- [ ] Backend: procedure auth.me retorna credits do usuário
- [ ] Frontend: exibir créditos disponíveis no Dashboard e na sidebar
- [ ] Frontend: bloquear botão de disparo quando credits = 0 com aviso

## Painel Administrativo
- [ ] Backend: adminProcedure para listar todos os usuários (id, nome, email, role, credits, createdAt)
- [ ] Backend: adminProcedure para atualizar créditos de um usuário
- [ ] Backend: adminProcedure para alterar role de um usuário (user/admin)
- [ ] Frontend: página /admin com tabela de usuários
- [ ] Frontend: editar créditos inline na tabela
- [ ] Frontend: botão promover/rebaixar role
- [ ] Frontend: rota /admin protegida por role admin
- [ ] Frontend: item "Admin" no menu lateral apenas para admins
- [ ] Promover conta adsconta962@gmail.com para admin via SQL
