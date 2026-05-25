import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerFacebookOAuthRoutes } from "../facebook-oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // Em produção, JWT_SECRET é obrigatório — sem ele, o middleware de auth
  // assina/valida tokens com string vazia, gerando comportamento errático.
  if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
    throw new Error(
      "JWT_SECRET não configurado. Gere com `openssl rand -hex 32` e defina no .env antes de subir."
    );
  }

  const app = express();
  // Atrás do Traefik (host network, faz TLS termination). Sem isso,
  // req.protocol retorna 'http' e o cookie de sessão é setado sem Secure,
  // o que faz Chrome rejeitar SameSite=None silenciosamente.
  app.set("trust proxy", 1);
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Facebook Embedded Signup routes
  registerFacebookOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // Privacy policy page — served as static HTML so Facebook crawler can validate it
  app.get("/privacy", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Política de Privacidade — WA Disparador</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #333; line-height: 1.7; }
    h1 { font-size: 2rem; margin-bottom: 4px; }
    h2 { font-size: 1.2rem; margin-top: 2rem; }
    p, li { font-size: 0.95rem; }
    ul { padding-left: 1.5rem; }
    a { color: #25d366; }
    footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #eee; font-size: 0.8rem; color: #999; text-align: center; }
  </style>
</head>
<body>
  <h1>Política de Privacidade</h1>
  <p><small>Última atualização: abril de 2026</small></p>

  <h2>1. Introdução</h2>
  <p>O <strong>WA Disparador</strong> respeita a sua privacidade e está comprometido em proteger as informações pessoais que você compartilha conosco. Esta Política de Privacidade descreve como coletamos, usamos e protegemos suas informações ao utilizar nosso serviço de disparos via WhatsApp Business API Oficial da Meta.</p>

  <h2>2. Informações que Coletamos</h2>
  <p>Ao utilizar nosso aplicativo, podemos coletar as seguintes informações:</p>
  <ul>
    <li>Nome e endereço de e-mail associados à sua conta Meta/Facebook</li>
    <li>Identificação do número de telefone WhatsApp Business (Phone Number ID)</li>
    <li>Token de acesso à API do WhatsApp Business</li>
    <li>Dados de campanhas de disparo (números de contato, mensagens enviadas, status de entrega)</li>
    <li>Listas de contatos criadas e gerenciadas dentro da plataforma</li>
  </ul>

  <h2>3. Como Usamos suas Informações</h2>
  <p>As informações coletadas são utilizadas exclusivamente para:</p>
  <ul>
    <li>Autenticar e identificar sua conta na plataforma</li>
    <li>Realizar disparos de mensagens via WhatsApp Business API em seu nome</li>
    <li>Armazenar histórico de campanhas para consulta e análise</li>
    <li>Gerenciar listas de contatos cadastradas por você</li>
    <li>Melhorar a experiência e funcionalidades da plataforma</li>
  </ul>

  <h2>4. Compartilhamento de Dados</h2>
  <p>Não vendemos, alugamos ou compartilhamos suas informações pessoais com terceiros, exceto quando necessário para a operação do serviço (como a própria API da Meta/WhatsApp) ou quando exigido por lei.</p>

  <h2>5. Integração com a Meta (Facebook/WhatsApp)</h2>
  <p>Nosso aplicativo utiliza a API oficial do WhatsApp Business da Meta. Ao conectar sua conta via Facebook, você autoriza o acesso às permissões necessárias para o funcionamento do serviço. Você pode revogar esse acesso a qualquer momento nas configurações da sua conta Meta Business.</p>
  <p>Para mais informações sobre como a Meta trata seus dados, consulte a <a href="https://www.facebook.com/privacy/policy/" target="_blank">Política de Privacidade da Meta</a>.</p>

  <h2>6. Segurança</h2>
  <p>Adotamos medidas técnicas e organizacionais adequadas para proteger suas informações contra acesso não autorizado, alteração, divulgação ou destruição. Os tokens de acesso são armazenados de forma segura e nunca são expostos publicamente.</p>

  <h2>7. Retenção de Dados</h2>
  <p>Mantemos seus dados enquanto sua conta estiver ativa. Você pode solicitar a exclusão de seus dados a qualquer momento entrando em contato conosco. Após a exclusão, os dados são removidos permanentemente de nossos servidores.</p>

  <h2>8. Seus Direitos</h2>
  <ul>
    <li>Acessar as informações que temos sobre você</li>
    <li>Solicitar a correção de dados incorretos</li>
    <li>Solicitar a exclusão de seus dados</li>
    <li>Revogar o acesso do aplicativo à sua conta Meta a qualquer momento</li>
  </ul>

  <h2>9. Contato</h2>
  <p>Para dúvidas, solicitações ou exercício dos seus direitos, entre em contato pelo e-mail: <a href="mailto:eras3455@outlook.com">eras3455@outlook.com</a></p>

  <h2>10. Alterações nesta Política</h2>
  <p>Podemos atualizar esta Política de Privacidade periodicamente. Notificaremos sobre mudanças significativas através do próprio aplicativo. O uso continuado do serviço após as alterações constitui aceitação da nova política.</p>

  <footer>© 2026 WA Disparador — API Oficial Meta WhatsApp Business</footer>
</body>
</html>`);
  });

  // ─── WhatsApp Webhook ──────────────────────────────────────────────────────
  // GET: Meta verifica o webhook com hub.challenge
  app.get("/api/webhook/whatsapp", async (req, res) => {
    const { getSetting } = await import("../settings");
    const VERIFY_TOKEN =
      (await getSetting("WHATSAPP_WEBHOOK_TOKEN")) ||
      process.env.WHATSAPP_WEBHOOK_TOKEN ||
      "wa_disparo_webhook_token";
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("[Webhook] WhatsApp webhook verified");
      res.status(200).send(challenge);
    } else {
      res.status(403).send("Forbidden");
    }
  });

  // POST: recebe mensagens e status updates do Meta
  app.post("/api/webhook/whatsapp", async (req, res) => {
    res.status(200).send("OK"); // Responde 200 imediatamente para o Meta
    try {
      const body = req.body;
      if (body?.object !== "whatsapp_business_account") return;

      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field !== "messages") continue;
          const value = change.value;
          const phoneNumberId = value?.metadata?.phone_number_id;
          if (!phoneNumberId) continue;

          // Importar funções de DB dinamicamente para evitar circular deps
          const {
            getOrCreateConversation,
            createInboxMessage,
            updateConversationLastMessage,
            getDb,
          } = await import("../db");
          const { whatsappSessions } = await import("../../drizzle/schema");
          const { eq } = await import("drizzle-orm");

          // Encontrar a sessão pelo phoneNumberId
          const db = await getDb();
          if (!db) continue;
          const sessions = await db
            .select()
            .from(whatsappSessions)
            .where(eq(whatsappSessions.phoneNumberId, phoneNumberId))
            .limit(1);
          if (sessions.length === 0) continue;
          const session = sessions[0];

          // Processar mensagens recebidas
          for (const msg of value?.messages || []) {
            if (msg.type !== "text") continue;
            const fromPhone = msg.from;
            const body_text = msg.text?.body || "";
            const contactName = value?.contacts?.find((c: { wa_id: string }) => c.wa_id === fromPhone)?.profile?.name;

            const conv = await getOrCreateConversation(
              session.userId,
              session.id,
              fromPhone,
              contactName
            );

            await createInboxMessage({
              conversationId: conv.id,
              sessionId: session.id,
              waMessageId: msg.id,
              direction: "inbound",
              phone: fromPhone,
              body: body_text,
              type: "text",
              status: "received",
            });

            await updateConversationLastMessage(conv.id, body_text, true);

            // ─── Verifica automações ativas para esta sessão ───────────────────────────────────────────
            try {
              const { getActiveAutomationsForSession, hasAutomationBeenSent, logAutomationSent } = await import("../db");
              const automations = await getActiveAutomationsForSession(session.id);
              const msgLower = body_text.toLowerCase().trim();

              for (const automation of automations) {
                if (!automation.steps.length) continue;

                // Verifica se o trigger bate com a mensagem recebida
                const triggerLower = automation.trigger.toLowerCase().trim();
                let matched = false;
                if (automation.triggerType === "exact") {
                  matched = msgLower === triggerLower;
                } else if (automation.triggerType === "starts_with") {
                  matched = msgLower.startsWith(triggerLower);
                } else {
                  // contains (default)
                  matched = msgLower.includes(triggerLower);
                }

                if (!matched) continue;

                // Verifica se já enviou para este contato nas últimas 24h
                const alreadySent = await hasAutomationBeenSent(automation.id, session.id, fromPhone);
                if (alreadySent) continue;

                // Registra o envio antes de disparar
                await logAutomationSent(automation.id, session.id, fromPhone);

                // Envia os passos do funil com delay
                (async () => {
                  for (const step of automation.steps) {
                    if (step.delaySeconds > 0) {
                      await new Promise(resolve => setTimeout(resolve, step.delaySeconds * 1000));
                    }
                    try {
                      await fetch(
                        `https://graph.facebook.com/v19.0/${session.phoneNumberId}/messages`,
                        {
                          method: "POST",
                          headers: {
                            Authorization: `Bearer ${session.accessToken}`,
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({
                            messaging_product: "whatsapp",
                            recipient_type: "individual",
                            to: fromPhone,
                            type: "text",
                            text: { preview_url: false, body: step.message },
                          }),
                        }
                      );
                      // Salva a mensagem enviada na conversa
                      const { createInboxMessage: saveMsg, updateConversationLastMessage: updateLast } = await import("../db");
                      await saveMsg({
                        conversationId: conv.id,
                        sessionId: session.id,
                        direction: "outbound",
                        phone: fromPhone,
                        body: step.message,
                        type: "text",
                        status: "sent",
                      });
                      await updateLast(conv.id, step.message, false);
                    } catch (sendErr) {
                      console.error("[Automation] Error sending step:", sendErr);
                    }
                  }
                })();

                // Apenas uma automação por mensagem
                break;
              }
            } catch (autoErr) {
              console.error("[Automation] Error checking automations:", autoErr);
            }
          }
        }
      }
    } catch (err) {
      console.error("[Webhook] Error processing WhatsApp webhook:", err);
    }
  });

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);

// Start scheduled dispatch worker
import("../scheduledWorker").then(m => m.startScheduledWorker()).catch(console.error);
