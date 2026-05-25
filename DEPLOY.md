# Deploy — painelapi.online (Hostinger VPS srv1690266)

Reverse proxy Traefik já roda na VPS, ocupa 80/443 e emite cert Let's Encrypt
automaticamente via labels. MySQL desta stack é isolado (sem porta exposta).

## 0. Pré-requisitos (Windows local)

- `git` instalado.
- Repo GitHub: https://github.com/VitorPassoss/whatsappdisparo.git
  (deve estar vazio — sem README/license inicial).

## 1. Inicializar git local e dar push

No PowerShell, dentro de `C:\Users\Vitor\projetos\disparos`:

```powershell
git init
git add .
git commit -m "feat: initial commit com chunkMessage + docker stack"
git branch -M main
git remote add origin https://github.com/VitorPassoss/whatsappdisparo.git
git push -u origin main
```

> **Atenção:** o `.gitignore` já bloqueia `.env`, `node_modules`, `dist/` e
> os logs do `.manus-logs/`. Se preferir SSH em vez de HTTPS, use
> `git@github.com:VitorPassoss/whatsappdisparo.git`.

## 2. DNS

Aponte o A record do domínio pro IP da VPS **antes** de subir o compose
(Traefik precisa que o domínio resolva pra emitir o cert ACME).

```bash
# Na VPS, descobrir o IP público
curl -s ifconfig.me
```

Depois propague e teste:

```bash
dig +short painelapi.online
# deve retornar o IP da VPS
```

## 3. SSH e clone na VPS

```bash
ssh root@srv1690266.hstgr.cloud   # ou IP
cd /var/www
git clone https://github.com/VitorPassoss/whatsappdisparo.git disparos
cd disparos
```

Se o repo for privado, o `git clone` via HTTPS vai pedir credenciais — use um
Personal Access Token (Settings → Developer settings → Personal access tokens
→ Fine-grained) com escopo de leitura no repo, e cole como senha. Ou cadastre
uma deploy key SSH dedicada e use `git@github.com:VitorPassoss/whatsappdisparo.git`.

## 4. Configurar `.env`

```bash
cp .env.example .env

# Gera secrets fortes
DB_ROOT=$(openssl rand -hex 16)
DB_PASS=$(openssl rand -hex 16)
JWT=$(openssl rand -hex 32)
WEBHOOK=$(openssl rand -hex 24)

# Substitui no .env (sed in-place)
sed -i "s|trocar_openssl_rand_hex_16|$DB_ROOT|"  .env   # primeira ocorrência: DB_PASSWORD
sed -i "s|trocar_openssl_rand_hex_16|$DB_PASS|"  .env   # segunda: DB_ROOT_PASSWORD
sed -i "s|trocar_openssl_rand_hex_32|$JWT|"      .env
sed -i "s|trocar_token_qualquer_string_aleatoria|$WEBHOOK|" .env

# Preenche secrets do Facebook (cole os valores ou edite manualmente)
nano .env
```

Confirme com `cat .env` antes de prosseguir. Anote o `WHATSAPP_WEBHOOK_TOKEN`
— você vai precisar dele no Meta App Dashboard ao registrar o webhook.

## 5. Verificações pré-up

```bash
# Rede do Traefik existe?
docker network ls | grep evolution-api-1i9c_default

# Domínio painelapi.online já está em outro container?
docker ps --format '{{.Names}}\t{{.Labels}}' | grep -i "painelapi.online"
# (não pode retornar nada)

# Variáveis do .env são consumidas corretamente?
docker compose config | grep -E "DOMAIN|TRAEFIK_NETWORK|APP_NAME"
```

## 6. Build + up

```bash
docker compose up -d --build
```

Acompanha logs:

```bash
docker compose logs -f app
# Esperar: "Server running on http://localhost:3000/"
docker compose logs traefik 2>&1 | grep -i painelapi
# Não pode ter "unable to obtain ACME certificate"
```

## 7. Rodar migrations do Drizzle (primeira vez)

A imagem do runner já inclui `drizzle-kit`. Rodar uma única vez (ou após
qualquer schema change no `drizzle/schema.ts`):

```bash
docker compose exec app pnpm exec drizzle-kit migrate
```

> Se o comando reclamar de `DATABASE_URL`, confirme que o container `app`
> tem a env: `docker compose exec app env | grep DATABASE_URL`.

## 8. Smoke test

```bash
# Cert e proxy funcionando?
curl -I https://painelapi.online
# Esperar: HTTP/2 200 ou 301, header server: traefik

# A página /privacy é servida estaticamente pelo Express
curl -s https://painelapi.online/privacy | head -3
# Esperar: <!DOCTYPE html><html lang="pt-BR">
```

Acessa o painel em https://painelapi.online no navegador, registra o
primeiro usuário (vira admin se `OWNER_OPEN_ID` bater com o openId gerado
após o primeiro login).

## 9. Configurar o webhook no Meta App

No Meta App Dashboard → Webhooks → WhatsApp:

- **Callback URL**: `https://painelapi.online/api/webhook/whatsapp`
- **Verify token**: o mesmo valor de `WHATSAPP_WEBHOOK_TOKEN` no `.env`

Click em **Verify and save**. O endpoint GET responde 200 com `hub.challenge`
quando o token bate (ver `server/_core/index.ts:130`).

## 10. Updates futuros

```bash
ssh root@srv1690266.hstgr.cloud
cd /var/www/disparos
git pull
docker compose up -d --build
# Se houve schema change:
docker compose exec app pnpm exec drizzle-kit migrate
```

## 11. Rollback

```bash
# Rollback rápido (volta pro commit anterior, mantém banco)
git log --oneline -5
git checkout <hash-anterior>
docker compose up -d --build

# Rollback total (apaga banco — só faça se for primeira instalação que falhou)
docker compose down -v
```

---

## Troubleshooting

| Sintoma | Causa provável | Fix |
|---|---|---|
| `502 Bad Gateway` no domínio | Porta no label `loadbalancer.server.port` não bate com `PORT` do app, OU app crashou | `docker compose logs app` — confirma que subiu na 3000 |
| `404` do Traefik | Container não está na rede `evolution-api-1i9c_default`, OU label `Host()` com domínio errado | `docker inspect disparos-app | grep -A2 Networks` |
| Cert Let's Encrypt não emite | DNS ainda não propagou; OU porta 80 bloqueada (LE usa HTTP-01); OU rate limit do LE | `dig +short painelapi.online`; espera 10min; check `docker logs traefik` |
| Conflito de container name `disparos-app` | Algo já rodando com esse nome | `docker compose down`, ou troca `APP_NAME` no `.env` |
| `Access denied for user 'disparos'` | Senha `.env` foi alterada mas o volume `disparos_db_data` ainda tem o user antigo | `docker compose down -v` apaga volume (perde dados) OU entra no container e reseta a senha via root |
| `drizzle-kit: command not found` ao rodar migration | Estou rodando fora do container, ou imagem foi buildada antes do Dockerfile incluir drizzle-kit no runner | Sempre rode `docker compose exec app pnpm exec drizzle-kit migrate`, nunca direto no host |
| MySQL não sobe (loop de restart) | Volume corrompido OU senha root mudou entre runs | `docker compose down -v` na primeira instalação; em produção, recuperar do dump |
| Webhook do Meta falha verificação | `WHATSAPP_WEBHOOK_TOKEN` no `.env` ≠ verify token configurado no Meta | Conferir os dois lados, fazer `docker compose restart app` |

---

## Arquitetura na VPS (resumo)

```
internet ─→ Traefik (host network, 80/443)
              │
              ├─→ evolution-api-1i9c-api-1   (já existia)
              ├─→ whatsapp-group-auto-join   (já existia, autojoin.online)
              └─→ disparos-app:3000          ← NOVO (painelapi.online)
                       │
                       └─ rede interna ─→ disparos-db:3306 (MySQL 8, sem porta exposta)
```

Tudo isolado por network nomeada (`disparos_internal`) — o MySQL desta stack
não enxerga nem é enxergado pelos outros stacks.
