import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  addContactsToList,
  createAutomation,
  createCampaign,
  createSession,
  createCampaignContacts,
  createContactList,
  deleteAutomation,
  deleteContactFromList,
  deleteContactList,
  deleteSession,
  getAutomationById,
  getAutomationsByUserId,
  getCampaignById,
  getCampaignContacts,
  getCampaignsByUserId,
  getContactListById,
  getContactListsByUserId,
  getContactsByListId,
  getDashboardStats,
  getSessionById,
  getSessionsByUserId,
  getUserByEmail,
  getUserCredits,
  deductCredits,
  addCredits,
  setCredits,
  getAllUsers,
  setUserRole,
  incrementCampaignCounts,
  setAutomationSteps,
  updateAutomation,
  updateCampaignStatus,
  updateContactListName,
  updateContactStatus,
  updateSessionAccessToken,
  updateSessionWabaId,
  updateUserPasswordHash,
  upsertUser,
  countAdmins,
} from "./db";
import bcrypt from "bcryptjs";
import { sdk } from "./_core/sdk";
import {
  chunkMessage,
  sendWhatsAppBlocks,
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
} from "./whatsapp-send";
import {
  createEvolutionCampaign,
  createEvolutionInstance,
  deleteEvolutionInstance,
  evolutionRemainingToday,
  getEvolutionInstanceById,
  getEvolutionInstancesByIds,
  getEvolutionInstancesByUserId,
  recordEvolutionSend,
  setContactInstance,
  updateEvolutionInstance,
} from "./db";
import {
  applySpintax,
  applyVariables,
  evoConnect,
  evoConnectionState,
  evoCreateInstance,
  evoDeleteInstance,
  evoFetchInstance,
  evoSendBlocks,
  type EvoConfig,
} from "./evolution-api";
import { getAllSettings, getEvolutionConfig, setSetting, type SettingKey } from "./settings";

// ─── WhatsApp Template metadata fetcher ─────────────────────────────────────

type WaTemplate = {
  id: string;
  name: string;
  status: string;
  language: string;
  category: string;
  components: {
    type: string;
    text?: string;
    format?: string;
    buttons?: { type: string; text: string; url?: string }[];
    example?: { body_text?: string[][]; header_text?: string[] };
  }[];
};

async function fetchWhatsAppTemplates(
  accessToken: string,
  wabaId: string
): Promise<{ templates: WaTemplate[]; error?: string }> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${wabaId}/message_templates?fields=id,name,status,language,category,components&limit=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = (await res.json()) as {
      data?: WaTemplate[];
      error?: { message: string };
    };
    if (!res.ok || data.error) {
      return { templates: [], error: data.error?.message ?? `HTTP ${res.status}` };
    }
    return { templates: (data.data ?? []).filter((t: WaTemplate) => t.status === "APPROVED") };
  } catch (err: unknown) {
    return { templates: [], error: err instanceof Error ? err.message : "Network error" };
  }
}

// Descobre o WABA ID (conta WhatsApp Business) a partir do Phone Number ID,
// usando só o Access Token. Os templates vivem dentro de uma WABA, então
// precisamos dela pra listar. Enumera as WABAs do token e casa o phone number;
// se houver só uma WABA, usa ela. Retorna null se não der pra detectar
// (ex.: token de system user sem acesso a /me) — aí o usuário informa à mão.
async function resolveWabaIdFromPhoneNumber(
  accessToken: string,
  phoneNumberId: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/me/whatsapp_business_accounts?fields=id&limit=100&access_token=${accessToken}`
    );
    const json = (await res.json()) as { data?: { id: string }[] };
    const wabas = json.data ?? [];
    for (const waba of wabas) {
      const pres = await fetch(
        `https://graph.facebook.com/v19.0/${waba.id}/phone_numbers?fields=id&limit=100&access_token=${accessToken}`
      );
      const pjson = (await pres.json()) as { data?: { id: string }[] };
      if ((pjson.data ?? []).some((n) => String(n.id) === String(phoneNumberId))) {
        return String(waba.id);
      }
    }
    if (wabas.length === 1) return String(wabas[0].id);
  } catch {
    // ignora — cai no retorno null e o front pede o WABA ID manual
  }
  return null;
}

function parsePhones(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim().replace(/\D/g, ""))
    .filter((s) => s.length >= 8);
}

// ─── Routers ──────────────────────────────────────────────────────────────────

const sessionsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    getSessionsByUserId(ctx.user.id)
  ),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
        accessToken: z.string().min(10),
        phoneNumberId: z.string().min(1),
        wabaId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await createSession({
        userId: ctx.user.id,
        name: input.name,
        accessToken: input.accessToken,
        phoneNumberId: input.phoneNumberId,
        wabaId: input.wabaId,
      });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteSession(input.id, ctx.user.id);
      return { success: true };
    }),

  updateWabaId: protectedProcedure
    .input(z.object({ id: z.number(), wabaId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      await updateSessionWabaId(input.id, ctx.user.id, input.wabaId);
      return { success: true };
    }),
});

const contactListsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    getContactListsByUserId(ctx.user.id)
  ),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(128) }))
    .mutation(async ({ ctx, input }) => {
      await createContactList({ userId: ctx.user.id, name: input.name });
      return { success: true };
    }),

  rename: protectedProcedure
    .input(z.object({ id: z.number(), name: z.string().min(1).max(128) }))
    .mutation(async ({ ctx, input }) => {
      await updateContactListName(input.id, ctx.user.id, input.name);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteContactList(input.id, ctx.user.id);
      return { success: true };
    }),

  getContacts: protectedProcedure
    .input(z.object({ listId: z.number() }))
    .query(async ({ ctx, input }) => {
      const list = await getContactListById(input.listId, ctx.user.id);
      if (!list) throw new TRPCError({ code: "NOT_FOUND" });
      return getContactsByListId(input.listId);
    }),

  addContacts: protectedProcedure
    .input(
      z.object({
        listId: z.number(),
        rawPhones: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const list = await getContactListById(input.listId, ctx.user.id);
      if (!list) throw new TRPCError({ code: "NOT_FOUND" });
      const phones = parsePhones(input.rawPhones);
      if (phones.length === 0)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum número válido encontrado" });
      await addContactsToList(phones.map((phone) => ({ listId: input.listId, phone })));
      return { success: true, count: phones.length };
    }),

  removeContact: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .mutation(async ({ input }) => {
      await deleteContactFromList(input.contactId);
      return { success: true };
    }),
});

const campaignsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        status: z.string().optional(),
        search: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }).optional()
    )
    .query(({ ctx, input }) =>
      getCampaignsByUserId(ctx.user.id, {
        status: input?.status,
        search: input?.search,
        dateFrom: input?.dateFrom ? new Date(input.dateFrom) : undefined,
        dateTo: input?.dateTo ? new Date(input.dateTo) : undefined,
      })
    ),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const campaign = await getCampaignById(input.id, ctx.user.id);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      return campaign;
    }),

  getContacts: protectedProcedure
    .input(
      z.object({
        campaignId: z.number(),
        status: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const campaign = await getCampaignById(input.campaignId, ctx.user.id);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      return getCampaignContacts(input.campaignId, input.status);
    }),

  // Create campaign and start sending
  send: protectedProcedure
    .input(
      z.object({
        // sessionId continua suportado (compat), mas o disparo pode vir com
        // credenciais manuais (Access Token + Phone Number ID) direto do form.
        sessionId: z.number().optional(),
        accessToken: z.string().min(10).optional(),
        phoneNumberId: z.string().min(1).optional(),
        name: z.string().min(1).max(128),
        // Sem cap de tamanho funcional: mensagens longas são segmentadas
        // em blocos pelo backend (`chunkMessage`). O `.max` aqui é só
        // um circuit-breaker contra payloads absurdos vindos do client.
        message: z.string().min(1).max(200_000),
        rawPhones: z.string().optional(),
        listId: z.number().optional(),
        // Contatos com variáveis dinâmicas (vindos do CSV): cada um tem o
        // telefone e os valores que preenchem {{1}}..{{n}} do template.
        contacts: z
          .array(
            z.object({
              phone: z.string().min(1),
              variables: z.array(z.string()).optional().default([]),
            })
          )
          .optional(),
        // Anti-ban delay settings (seconds) — usado só quando não há rate/concurrency.
        delayMin: z.number().min(1).max(300).optional().default(3),
        delayMax: z.number().min(1).max(300).optional().default(8),
        // Throughput: envio em paralelo (worker pool) com pacing por minuto.
        rateMsgsPerMin: z.number().min(1).max(100_000).optional(),
        concurrency: z.number().min(1).max(1000).optional(),
        // Template fields (optional)
        useTemplate: z.boolean().optional(),
        templateName: z.string().optional(),
        templateLanguage: z.string().optional(),
        templateVariables: z.array(z.string()).optional(),
        templateVariableCount: z.number().min(0).max(20).optional(),
        templateHeaderImageUrl: z.string().optional(),
        scheduledAt: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Resolve a sessão. Credenciais manuais (Access Token + Phone Number ID)
      // têm prioridade: reaproveitamos uma sessão existente com o mesmo
      // phoneNumberId (atualizando o token) ou criamos uma nova por baixo dos
      // panos, pra campanha/créditos continuarem amarrados a uma sessão.
      let session;
      if (input.accessToken && input.phoneNumberId) {
        const phoneNumberId = input.phoneNumberId;
        const accessToken = input.accessToken;
        const existing = (await getSessionsByUserId(ctx.user.id)).find(
          (s) => s.phoneNumberId === phoneNumberId
        );
        if (existing) {
          if (existing.accessToken !== accessToken) {
            await updateSessionAccessToken(existing.id, ctx.user.id, accessToken);
          }
          session = { ...existing, accessToken };
        } else {
          const created = await createSession({
            userId: ctx.user.id,
            name: `Campanha ${phoneNumberId}`,
            accessToken,
            phoneNumberId,
          });
          session = await getSessionById((created as { insertId: number }).insertId, ctx.user.id);
        }
      } else if (input.sessionId) {
        session = await getSessionById(input.sessionId, ctx.user.id);
      }
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Sessão não encontrada" });

      // Monta a lista unificada de contatos com variáveis. Prioridade pro CSV
      // (que traz variáveis), depois rawPhones e listas salvas (sem variáveis).
      // Dedup por telefone normalizado, mantendo a 1ª ocorrência.
      const varCount = input.templateVariableCount ?? input.templateVariables?.length ?? 0;
      const byPhone = new Map<string, string[]>();
      const pushContact = (rawPhone: string, vars: string[]) => {
        const phone = rawPhone.replace(/\D/g, "");
        if (phone.length < 8 || byPhone.has(phone)) return;
        // Normaliza pro número exato de variáveis do template (pad/trunca).
        const norm =
          varCount > 0 ? Array.from({ length: varCount }, (_, i) => vars[i] ?? "") : [];
        byPhone.set(phone, norm);
      };

      for (const c of input.contacts ?? []) pushContact(c.phone, c.variables ?? []);
      if (input.rawPhones) for (const p of parsePhones(input.rawPhones)) pushContact(p, []);
      if (input.listId) {
        const list = await getContactListById(input.listId, ctx.user.id);
        if (!list) throw new TRPCError({ code: "NOT_FOUND", message: "Lista não encontrada" });
        const listContacts = await getContactsByListId(input.listId);
        for (const c of listContacts) pushContact(c.phone, []);
      }

      const contactsList = Array.from(byPhone.entries()).map(([phone, variables]) => ({
        phone,
        variables,
      }));

      if (contactsList.length === 0)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum número válido encontrado" });

      // Check credits (admin users are exempt)
      if (ctx.user.role !== "admin") {
        const credits = await getUserCredits(ctx.user.id);
        if (credits < contactsList.length) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Créditos insuficientes. Você tem ${credits} crédito${credits !== 1 ? "s" : ""} e está tentando enviar para ${contactsList.length} contato${contactsList.length !== 1 ? "s" : ""}. Adquira mais créditos para continuar.`,
          });
        }
      }

      // Create campaign
      const campaignResult = await createCampaign({
        userId: ctx.user.id,
        sessionId: session.id,
        name: input.name,
        message: input.message,
        totalContacts: contactsList.length,
        scheduledAt: input.scheduledAt,
      });

      const campaignId = (campaignResult as { insertId: number }).insertId;

      // Create contact records (guarda as variáveis como JSON por contato)
      await createCampaignContacts(
        contactsList.map((c) => ({
          campaignId,
          phone: c.phone,
          status: "pending" as const,
          variables: c.variables.length > 0 ? JSON.stringify(c.variables) : null,
        }))
      );

      // If scheduled for future, save as scheduled and return
      if (input.scheduledAt && input.scheduledAt > new Date()) {
        await updateCampaignStatus(campaignId, "scheduled");
        return { success: true, campaignId, scheduled: true };
      }

      // Pré-segmenta a copy uma única vez por campanha (free-text).
      // Templates não são chunkáveis (cada um é uma unidade aprovada).
      const blocks = input.useTemplate ? [] : chunkMessage(input.message);

      // Start sending asynchronously — worker pool com pacing por minuto.
      (async () => {
        await updateCampaignStatus(campaignId, "running");
        const contacts = await getCampaignContacts(campaignId);

        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
        const isTemplate = !!(input.useTemplate && input.templateName);

        // Throughput: nº de workers e intervalo global entre disparos.
        const workers = Math.max(1, Math.min(input.concurrency ?? 1, 1000));
        const intervalMs = input.rateMsgsPerMin
          ? Math.max(0, Math.floor(60_000 / input.rateMsgsPerMin))
          : 0;

        // Pacer global: garante no máx. 1 disparo a cada intervalMs, mesmo
        // com vários workers (JS é single-thread, então o claim é atômico).
        let nextSlot = Date.now();
        const acquireSlot = async () => {
          if (intervalMs <= 0) return;
          const now = Date.now();
          const wait = Math.max(0, nextSlot - now);
          nextSlot = Math.max(now, nextSlot) + intervalMs;
          if (wait > 0) await sleep(wait);
        };

        let successCount = 0;
        let errorCount = 0;
        let cursor = 0;
        let stopped = false;

        const worker = async () => {
          while (!stopped) {
            const i = cursor++;
            if (i >= contacts.length) return;
            const contact = contacts[i];

            await acquireSlot();
            if (stopped) return;

            // Variáveis específicas deste contato (do CSV); fallback pro global.
            let vars: string[] = input.templateVariables ?? [];
            if (contact.variables) {
              try {
                const parsed = JSON.parse(contact.variables);
                if (Array.isArray(parsed)) vars = parsed.map((v) => String(v));
              } catch {
                /* mantém fallback */
              }
            }

            const result = isTemplate
              ? await sendWhatsAppTemplate(
                  session.accessToken,
                  session.phoneNumberId,
                  contact.phone,
                  input.templateName!,
                  input.templateLanguage ?? "pt_BR",
                  vars,
                  input.templateHeaderImageUrl
                )
              : await sendWhatsAppBlocks(
                  session.accessToken,
                  session.phoneNumberId,
                  contact.phone,
                  blocks
                );

            const firstMessageId =
              "messageIds" in result ? result.messageIds[0] : result.messageId;

            if (result.success) {
              successCount++;
              await updateContactStatus(contact.id, "sent", {
                messageId: firstMessageId,
                sentAt: new Date(),
              });
              await incrementCampaignCounts(campaignId, {
                sentCount: 1,
                successCount: 1,
                pendingCount: -1,
              });
              if (ctx.user.role !== "admin") {
                await deductCredits(ctx.user.id, 1);
              }
            } else {
              errorCount++;
              await updateContactStatus(contact.id, "failed", {
                errorMessage: result.error,
              });
              await incrementCampaignCounts(campaignId, {
                sentCount: 1,
                errorCount: 1,
                pendingCount: -1,
              });
            }

            // Sem rate configurado e sequencial: mantém o delay anti-ban legado.
            if (intervalMs <= 0 && workers === 1) {
              const dMin = (input.delayMin ?? 3) * 1000;
              const dMax = (input.delayMax ?? 8) * 1000;
              await sleep(Math.floor(Math.random() * (dMax - dMin + 1)) + dMin);
            }

            // Auto-pause se taxa de erro passar de 30% após ao menos 10 envios.
            const totalProcessed = successCount + errorCount;
            if (totalProcessed >= 10 && errorCount / totalProcessed > 0.3) {
              stopped = true;
              await updateCampaignStatus(campaignId, "failed");
              console.error(
                `[Campaign ${campaignId}] Auto-paused: error rate ${Math.round((errorCount / totalProcessed) * 100)}% exceeded 30%`
              );
              return;
            }
          }
        };

        await Promise.all(Array.from({ length: workers }, () => worker()));

        if (!stopped) {
          const finalStatus = errorCount === contacts.length ? "failed" : "completed";
          await updateCampaignStatus(campaignId, finalStatus);
        }
      })().catch((err) => {
        console.error("[Campaign] Error:", err);
        updateCampaignStatus(campaignId, "failed").catch(console.error);
      });

      return { success: true, campaignId };
    }),

  // Cancel a scheduled campaign
  cancel: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const campaign = await getCampaignById(input.id, ctx.user.id);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campanha não encontrada" });
      if (campaign.status !== "scheduled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas campanhas agendadas podem ser canceladas" });
      }
      await updateCampaignStatus(input.id, "cancelled");
      return { success: true };
    }),
});

const templatesRouter = router({
  list: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const session = await getSessionById(input.sessionId, ctx.user.id);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Sessão não encontrada" });

      // Use wabaId stored in session (set during Facebook OAuth)
      const wabaId = session.wabaId;

      if (!wabaId) {
        throw new TRPCError({ 
          code: "BAD_REQUEST", 
          message: "WABA ID não configurado. Reconecte sua conta pelo botão 'Entrar com Facebook' para atualizar a sessão." 
        });
      }

      const result = await fetchWhatsAppTemplates(session.accessToken, wabaId);
      if (result.error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error });
      }
      return result.templates;
    }),

  // Lista templates a partir de credenciais manuais (sem sessão salva).
  // O WABA ID é detectado pelo Phone Number ID; se não der, o front manda
  // o wabaId à mão.
  listManual: protectedProcedure
    .input(
      z.object({
        accessToken: z.string().min(10),
        phoneNumberId: z.string().min(1),
        wabaId: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const wabaId =
        input.wabaId?.trim() ||
        (await resolveWabaIdFromPhoneNumber(input.accessToken, input.phoneNumberId));

      if (!wabaId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Não foi possível detectar o WABA ID automaticamente com esse token. Informe o WABA ID manualmente.",
        });
      }

      const result = await fetchWhatsAppTemplates(input.accessToken, wabaId);
      if (result.error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error });
      }
      return result.templates;
    }),
});

// ─── Evolution API Router (chips não-oficiais multi-número) ──────────────────

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos/diacríticos (marcas combinantes)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 32);
}

async function requireEvoConfig(): Promise<EvoConfig> {
  const config = await getEvolutionConfig();
  if (!config) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Servidor Evolution não configurado. Um admin precisa definir EVOLUTION_API_URL e EVOLUTION_API_KEY em Configurações.",
    });
  }
  return config;
}

const evolutionRouter = router({
  // Status da configuração do servidor (sem expor a apikey).
  config: protectedProcedure.query(async () => {
    const config = await getEvolutionConfig();
    return {
      configured: !!config,
      baseUrl: config?.baseUrl ?? null,
    };
  }),

  // ─── Chips / instâncias ───────────────────────────────────────────────────
  listInstances: protectedProcedure.query(({ ctx }) =>
    getEvolutionInstancesByUserId(ctx.user.id),
  ),

  createInstance: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
        dailyLimit: z.number().min(1).max(2000).optional().default(80),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const config = await requireEvoConfig();
      // Nome técnico único da instância no servidor Evolution.
      const instanceName = `chip_${ctx.user.id}_${slugify(input.name) || "chip"}_${Date.now().toString(36)}`;

      const created = await evoCreateInstance(config, instanceName);
      if (!created.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: created.error ?? "Falha ao criar instância na Evolution" });
      }

      const id = await createEvolutionInstance({
        userId: ctx.user.id,
        name: input.name,
        instanceName,
        status: "connecting",
        dailyLimit: input.dailyLimit,
      });
      return { success: true, id, instanceName };
    }),

  // Pede o QR code / pairing code pra conectar o chip. Chamado ao abrir o modal.
  connectInstance: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const config = await requireEvoConfig();
      const inst = await getEvolutionInstanceById(input.id, ctx.user.id);
      if (!inst) throw new TRPCError({ code: "NOT_FOUND", message: "Chip não encontrado" });

      // Garante que a instância exista no servidor (idempotente).
      await evoCreateInstance(config, inst.instanceName);
      const qr = await evoConnect(config, inst.instanceName);
      if (!qr.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: qr.error ?? "Falha ao gerar QR code" });
      }
      await updateEvolutionInstance(input.id, ctx.user.id, { status: "connecting" });
      return { base64: qr.base64 ?? null, pairingCode: qr.pairingCode ?? null, state: qr.state ?? "connecting" };
    }),

  // Estado da conexão (polling). Quando "open", sincroniza número/perfil no banco.
  instanceState: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const config = await requireEvoConfig();
      const inst = await getEvolutionInstanceById(input.id, ctx.user.id);
      if (!inst) throw new TRPCError({ code: "NOT_FOUND", message: "Chip não encontrado" });

      const { state } = await evoConnectionState(config, inst.instanceName);
      const connected = state === "open";

      if (connected && inst.status !== "connected") {
        const meta = await evoFetchInstance(config, inst.instanceName);
        await updateEvolutionInstance(input.id, ctx.user.id, {
          status: "connected",
          phone: meta.phone ?? inst.phone ?? null,
          profileName: meta.profileName ?? inst.profileName ?? null,
        });
      } else if (!connected && state === "close" && inst.status === "connected") {
        await updateEvolutionInstance(input.id, ctx.user.id, { status: "disconnected" });
      }

      return { state, connected };
    }),

  updateInstance: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(128).optional(),
        dailyLimit: z.number().min(1).max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const inst = await getEvolutionInstanceById(input.id, ctx.user.id);
      if (!inst) throw new TRPCError({ code: "NOT_FOUND" });
      const { id, ...data } = input;
      await updateEvolutionInstance(id, ctx.user.id, data);
      return { success: true };
    }),

  deleteInstance: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const inst = await getEvolutionInstanceById(input.id, ctx.user.id);
      if (!inst) throw new TRPCError({ code: "NOT_FOUND" });
      const config = await getEvolutionConfig();
      if (config) await evoDeleteInstance(config, inst.instanceName).catch(() => {});
      await deleteEvolutionInstance(input.id, ctx.user.id);
      return { success: true };
    }),

  // ─── Disparo multi-chip com contingência anti-ban ─────────────────────────
  send: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
        // Copy livre — suporta spintax {a|b} e variáveis {{1}}..{{n}} do CSV.
        message: z.string().min(1).max(200_000),
        // Chips selecionados pra rodízio. O disparo é distribuído entre eles.
        instanceIds: z.array(z.number()).min(1),
        rawPhones: z.string().optional(),
        listId: z.number().optional(),
        contacts: z
          .array(
            z.object({
              phone: z.string().min(1),
              variables: z.array(z.string()).optional().default([]),
            }),
          )
          .optional(),
        // Delay aleatório entre envios de cada chip (segundos) — anti-ban.
        delayMin: z.number().min(1).max(600).optional().default(10),
        delayMax: z.number().min(1).max(600).optional().default(30),
        // Simula "digitando..." antes de enviar (contingência humana).
        simulateTyping: z.boolean().optional().default(true),
        // Embaralha a ordem dos contatos pra não disparar em sequência óbvia.
        shuffle: z.boolean().optional().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const config = await requireEvoConfig();

      // Valida chips: precisam ser do usuário e estar conectados.
      const instances = await getEvolutionInstancesByIds(input.instanceIds, ctx.user.id);
      if (instances.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione ao menos um chip" });
      }
      const connected = instances.filter((i) => i.status === "connected");
      if (connected.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Nenhum dos chips selecionados está conectado. Conecte ao menos um via QR code.",
        });
      }

      // Monta a lista de contatos com variáveis (CSV > rawPhones > lista salva).
      const byPhone = new Map<string, string[]>();
      const pushContact = (rawPhone: string, vars: string[]) => {
        const phone = rawPhone.replace(/\D/g, "");
        if (phone.length < 8 || byPhone.has(phone)) return;
        byPhone.set(phone, vars);
      };
      for (const c of input.contacts ?? []) pushContact(c.phone, c.variables ?? []);
      if (input.rawPhones) for (const p of parsePhones(input.rawPhones)) pushContact(p, []);
      if (input.listId) {
        const list = await getContactListById(input.listId, ctx.user.id);
        if (!list) throw new TRPCError({ code: "NOT_FOUND", message: "Lista não encontrada" });
        const listContacts = await getContactsByListId(input.listId);
        for (const c of listContacts) pushContact(c.phone, []);
      }

      let contactsList = Array.from(byPhone.entries()).map(([phone, variables]) => ({ phone, variables }));
      if (contactsList.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum número válido encontrado" });
      }

      // Contingência: teto agregado = soma do que cada chip ainda pode enviar hoje.
      const totalCapacity = connected.reduce((sum, i) => sum + evolutionRemainingToday(i), 0);
      if (totalCapacity <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Os chips selecionados já atingiram o limite diário. Aguarde ou aumente o limite.",
        });
      }

      // Embaralho determinístico-o-suficiente (Fisher-Yates).
      if (input.shuffle) {
        for (let i = contactsList.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [contactsList[i], contactsList[j]] = [contactsList[j], contactsList[i]];
        }
      }

      // Créditos (admin isento).
      if (ctx.user.role !== "admin") {
        const credits = await getUserCredits(ctx.user.id);
        if (credits < contactsList.length) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Créditos insuficientes. Você tem ${credits} e está tentando enviar para ${contactsList.length} contatos.`,
          });
        }
      }

      const campaignId = await createEvolutionCampaign({
        userId: ctx.user.id,
        name: input.name,
        message: input.message,
        totalContacts: contactsList.length,
        instanceIds: connected.map((i) => i.id),
      });

      await createCampaignContacts(
        contactsList.map((c) => ({
          campaignId,
          phone: c.phone,
          status: "pending" as const,
          variables: c.variables.length > 0 ? JSON.stringify(c.variables) : null,
        })),
      );

      // Worker por chip: cada um puxa contatos de uma fila compartilhada,
      // respeita seu próprio teto diário e espaça os envios com delay aleatório.
      (async () => {
        await updateCampaignStatus(campaignId, "running");
        const contactRows = await getCampaignContacts(campaignId);

        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
        const dMin = input.delayMin * 1000;
        const dMax = Math.max(input.delayMin, input.delayMax) * 1000;
        const randDelay = () => Math.floor(Math.random() * (dMax - dMin + 1)) + dMin;

        const remaining = new Map(connected.map((i) => [i.id, evolutionRemainingToday(i)]));
        let cursor = 0;
        let successCount = 0;
        let errorCount = 0;
        let stopped = false;

        const worker = async (inst: (typeof connected)[number]) => {
          while (!stopped) {
            if ((remaining.get(inst.id) ?? 0) <= 0) return; // chip esgotou o teto diário
            const i = cursor++;
            if (i >= contactRows.length) return;
            const contact = contactRows[i];

            // Variáveis do contato (CSV) + spintax resolvido a cada envio.
            let vars: string[] = [];
            if (contact.variables) {
              try {
                const parsed = JSON.parse(contact.variables);
                if (Array.isArray(parsed)) vars = parsed.map((v) => String(v));
              } catch {
                /* sem variáveis */
              }
            }
            const personalized = applyVariables(applySpintax(input.message), vars);
            const blocks = chunkMessage(personalized);
            const typingDelay = input.simulateTyping
              ? Math.floor(Math.random() * 2300) + 1200
              : 0;

            const result = await evoSendBlocks(config, inst.instanceName, contact.phone, blocks, {
              typingDelayMs: typingDelay,
            });

            remaining.set(inst.id, (remaining.get(inst.id) ?? 0) - 1);
            await setContactInstance(contact.id, inst.instanceName);

            if (result.success) {
              successCount++;
              await updateContactStatus(contact.id, "sent", {
                messageId: result.messageIds[0],
                sentAt: new Date(),
              });
              await incrementCampaignCounts(campaignId, { sentCount: 1, successCount: 1, pendingCount: -1 });
              await recordEvolutionSend(inst.id);
              if (ctx.user.role !== "admin") await deductCredits(ctx.user.id, 1);
            } else {
              errorCount++;
              await updateContactStatus(contact.id, "failed", { errorMessage: result.error });
              await incrementCampaignCounts(campaignId, { sentCount: 1, errorCount: 1, pendingCount: -1 });
            }

            // Auto-pausa se a taxa de erro passar de 30% após 10 envios.
            const processed = successCount + errorCount;
            if (processed >= 10 && errorCount / processed > 0.3) {
              stopped = true;
              await updateCampaignStatus(campaignId, "failed");
              console.error(`[Evolution ${campaignId}] Auto-pausado: erro ${Math.round((errorCount / processed) * 100)}%`);
              return;
            }

            await sleep(randDelay());
          }
        };

        await Promise.all(connected.map((inst) => worker(inst)));

        if (!stopped) {
          const finalStatus = successCount === 0 ? "failed" : "completed";
          await updateCampaignStatus(campaignId, finalStatus);
        }
      })().catch((err) => {
        console.error("[Evolution Campaign] Error:", err);
        updateCampaignStatus(campaignId, "failed").catch(console.error);
      });

      return { success: true, campaignId, usingChips: connected.length, capacity: totalCapacity };
    }),
});

const dashboardRouter = router({
  stats: protectedProcedure.query(({ ctx }) => getDashboardStats(ctx.user.id)),
});

// ─── Automations Router ──────────────────────────────────────────────────────────────────────────────
const automationsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    getAutomationsByUserId(ctx.user.id)
  ),

  create: protectedProcedure
    .input(
      z.object({
        sessionId: z.number(),
        name: z.string().min(1).max(128),
        trigger: z.string().min(1).max(256),
        triggerType: z.enum(["contains", "exact", "starts_with"]).default("contains"),
        steps: z.array(
          z.object({
            message: z.string().min(1),
            delaySeconds: z.number().min(0).max(3600).default(0),
          })
        ).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify session belongs to user
      const session = await getSessionById(input.sessionId, ctx.user.id);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Sessão não encontrada" });

      const id = await createAutomation({
        userId: ctx.user.id,
        sessionId: input.sessionId,
        name: input.name,
        trigger: input.trigger,
        triggerType: input.triggerType,
        isActive: "1",
      });
      await setAutomationSteps(id, input.steps);
      return { success: true, id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(128).optional(),
        trigger: z.string().min(1).max(256).optional(),
        triggerType: z.enum(["contains", "exact", "starts_with"]).optional(),
        isActive: z.enum(["0", "1"]).optional(),
        steps: z.array(
          z.object({
            message: z.string().min(1),
            delaySeconds: z.number().min(0).max(3600).default(0),
          })
        ).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getAutomationById(input.id, ctx.user.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const { id, steps, ...updateData } = input;
      if (Object.keys(updateData).length > 0) {
        await updateAutomation(id, ctx.user.id, updateData);
      }
      if (steps) {
        await setAutomationSteps(id, steps);
      }
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getAutomationById(input.id, ctx.user.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await deleteAutomation(input.id, ctx.user.id);
      return { success: true };
    }),

  toggleActive: protectedProcedure
    .input(z.object({ id: z.number(), isActive: z.enum(["0", "1"]) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getAutomationById(input.id, ctx.user.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await updateAutomation(input.id, ctx.user.id, { isActive: input.isActive });
      return { success: true };
    }),
});

// ─── Inbox Router ─────────────────────────────────────────────────────────────
const inboxRouter = router({
  // List all conversations for the current user
  listConversations: protectedProcedure
    .input(z.object({ sessionId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const {
        getConversationsByUser,
        getConversationsBySession,
      } = await import("./db");
      if (input.sessionId) {
        return getConversationsBySession(input.sessionId, ctx.user.id);
      }
      return getConversationsByUser(ctx.user.id);
    }),

  // Get messages for a conversation (with ownership check)
  getMessages: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ ctx, input }) => {
      const { getDb, getMessagesByConversation, markConversationRead } = await import("./db");
      const { conversations } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Verify ownership
      const convRows = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.userId, ctx.user.id)))
        .limit(1);
      if (!convRows.length) throw new TRPCError({ code: "NOT_FOUND" });
      await markConversationRead(input.conversationId);
      return getMessagesByConversation(input.conversationId);
    }),

  // Send a reply to a conversation
  reply: protectedProcedure
    .input(z.object({ conversationId: z.number(), message: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const {
        getDb,
        createInboxMessage,
        updateConversationLastMessage,
      } = await import("./db");
      const { conversations, whatsappSessions } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Get conversation
      const convRows = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, input.conversationId))
        .limit(1);
      if (!convRows.length) throw new TRPCError({ code: "NOT_FOUND" });
      const conv = convRows[0];
      if (conv.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

      // Get session
      const sessionRows = await db
        .select()
        .from(whatsappSessions)
        .where(eq(whatsappSessions.id, conv.sessionId))
        .limit(1);
      if (!sessionRows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Sessão não encontrada" });
      const session = sessionRows[0];

      // Send via WhatsApp API
      const result = await sendWhatsAppMessage(
        session.accessToken,
        session.phoneNumberId,
        conv.phone,
        input.message
      );

      if (!result.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Erro ao enviar mensagem" });
      }

      // Save outbound message
      await createInboxMessage({
        conversationId: conv.id,
        sessionId: conv.sessionId,
        waMessageId: result.messageId,
        direction: "outbound",
        phone: conv.phone,
        body: input.message,
        type: "text",
        status: "sent",
      });

      await updateConversationLastMessage(conv.id, input.message, false);
      return { success: true };
    }),

  // Mark conversation as read (with ownership check)
  markRead: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { getDb, markConversationRead } = await import("./db");
      const { conversations } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const convRows = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.userId, ctx.user.id)))
        .limit(1);
      if (!convRows.length) throw new TRPCError({ code: "NOT_FOUND" });
      await markConversationRead(input.conversationId);
      return { success: true };
    }),

  // Get total unread count
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const { getTotalUnreadCount } = await import("./db");
    return getTotalUnreadCount(ctx.user.id);
  }),
});

// ─── Admin Router ───────────────────────────────────────────────────────────
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores" });
  return next({ ctx });
});

// Lista das chaves que admin pode editar via UI. Bootstrap (DATABASE_URL,
// JWT_SECRET, NODE_ENV, PORT) NÃO entram aqui de propósito.
const EDITABLE_SETTING_KEYS = [
  "FACEBOOK_APP_ID",
  "FACEBOOK_APP_SECRET",
  "WHATSAPP_WEBHOOK_TOKEN",
  "APP_ORIGIN",
  "OWNER_OPEN_ID",
  "EVOLUTION_API_URL",
  "EVOLUTION_API_KEY",
] as const satisfies readonly SettingKey[];

const settingKeySchema = z.enum(EDITABLE_SETTING_KEYS);

const adminRouter = router({
  listUsers: adminProcedure.query(async () => {
    return getAllUsers();
  }),

  listSettings: adminProcedure.query(async () => {
    const all = await getAllSettings();
    // Mascarar valores sensíveis na resposta — só revela tamanho do segredo
    // pra confirmar que está configurado, sem expor pra quem abriu devtools.
    const SECRET_KEYS = new Set<SettingKey>([
      "FACEBOOK_APP_SECRET",
      "WHATSAPP_WEBHOOK_TOKEN",
      "EVOLUTION_API_KEY",
    ]);
    return EDITABLE_SETTING_KEYS.map((key) => {
      const raw = all[key] ?? "";
      const isSecret = SECRET_KEYS.has(key);
      return {
        key,
        value: isSecret ? "" : raw,
        hasValue: raw.length > 0,
        masked: isSecret,
      };
    });
  }),

  updateSetting: adminProcedure
    .input(z.object({ key: settingKeySchema, value: z.string().max(2048) }))
    .mutation(async ({ input }) => {
      await setSetting(input.key, input.value);
      return { success: true };
    }),

  setCredits: adminProcedure
    .input(z.object({ userId: z.number(), credits: z.number().min(0).max(999999) }))
    .mutation(async ({ input }) => {
      await setCredits(input.userId, input.credits);
      return { success: true };
    }),

  addCredits: adminProcedure
    .input(z.object({ userId: z.number(), amount: z.number().min(1).max(999999) }))
    .mutation(async ({ input }) => {
      await addCredits(input.userId, input.amount);
      return { success: true };
    }),

  setRole: adminProcedure
    .input(z.object({ userId: z.number(), role: z.enum(["user", "admin"]) }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode alterar sua própria role" });
      await setUserRole(input.userId, input.role);
      return { success: true };
    }),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(async (opts) => {
      if (!opts.ctx.user) return null;
      const credits = await getUserCredits(opts.ctx.user.id);
      return { ...opts.ctx.user, credits };
    }),

    register: publicProcedure
      .input(
        z.object({
          name: z.string().min(2).max(128),
          email: z.string().email(),
          password: z.string().min(8).max(128),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const existing = await getUserByEmail(input.email.toLowerCase());
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "E-mail já cadastrado. Faça login." });
        }
        const passwordHash = await bcrypt.hash(input.password, 12);
        // Generate a unique openId for email-based users
        const openId = `email:${input.email.toLowerCase()}`;
        await upsertUser({
          openId,
          name: input.name,
          email: input.email.toLowerCase(),
          loginMethod: "email",
          lastSignedIn: new Date(),
        });
        // Store password hash
        const user = await getUserByEmail(input.email.toLowerCase());
        if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await updateUserPasswordHash(user.id, passwordHash);
        // Bootstrap: se não existe nenhum admin ainda, promove este usuário.
        // Garante que o primeiro signup numa instalação nova já vira admin
        // e consegue acessar /admin/settings pra configurar tudo via UI.
        if ((await countAdmins()) === 0) {
          await setUserRole(user.id, "admin");
        }
        // Create session
        const sessionToken = await sdk.createSessionToken(openId, { name: input.name, expiresInMs: ONE_YEAR_MS });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        return { success: true } as const;
      }),

    login: publicProcedure
      .input(
        z.object({
          email: z.string().email(),
          password: z.string().min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const user = await getUserByEmail(input.email.toLowerCase());
        if (!user || !user.passwordHash) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou senha incorretos." });
        }
        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou senha incorretos." });
        }
        await upsertUser({ openId: user.openId, lastSignedIn: new Date() });
        // Rede de segurança: se a instalação ficou sem admin (ex: register
        // crashou antes da promoção), promove no primeiro login válido.
        if ((await countAdmins()) === 0) {
          await setUserRole(user.id, "admin");
        }
        const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name ?? "", expiresInMs: ONE_YEAR_MS });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        return { success: true } as const;
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  sessions: sessionsRouter,
  contactLists: contactListsRouter,
  campaigns: campaignsRouter,
  templates: templatesRouter,
  evolution: evolutionRouter,
  dashboard: dashboardRouter,
  inbox: inboxRouter,
  automations: automationsRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
