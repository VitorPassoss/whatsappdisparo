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
import { getAllSettings, setSetting, type SettingKey } from "./settings";

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
        sessionId: z.number(),
        name: z.string().min(1).max(128),
        // Sem cap de tamanho funcional: mensagens longas são segmentadas
        // em blocos pelo backend (`chunkMessage`). O `.max` aqui é só
        // um circuit-breaker contra payloads absurdos vindos do client.
        message: z.string().min(1).max(200_000),
        rawPhones: z.string().optional(),
        listId: z.number().optional(),
        // Anti-ban delay settings (seconds)
        delayMin: z.number().min(1).max(300).optional().default(3),
        delayMax: z.number().min(1).max(300).optional().default(8),
        // Template fields (optional)
        useTemplate: z.boolean().optional(),
        templateName: z.string().optional(),
        templateLanguage: z.string().optional(),
        templateVariables: z.array(z.string()).optional(),
        templateHeaderImageUrl: z.string().optional(),
        scheduledAt: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get session
      const session = await getSessionById(input.sessionId, ctx.user.id);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Sessão não encontrada" });

      // Parse phones
      let phones: string[] = [];
      if (input.rawPhones) {
        phones = parsePhones(input.rawPhones);
      }
      if (input.listId) {
        const list = await getContactListById(input.listId, ctx.user.id);
        if (!list) throw new TRPCError({ code: "NOT_FOUND", message: "Lista não encontrada" });
        const listContacts = await getContactsByListId(input.listId);
        const listPhones = listContacts.map((c) => c.phone);
        phones = Array.from(new Set([...phones, ...listPhones]));
      }

      if (phones.length === 0)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum número válido encontrado" });

      // Check credits (admin users are exempt)
      if (ctx.user.role !== "admin") {
        const credits = await getUserCredits(ctx.user.id);
        if (credits < phones.length) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Créditos insuficientes. Você tem ${credits} crédito${credits !== 1 ? "s" : ""} e está tentando enviar para ${phones.length} contato${phones.length !== 1 ? "s" : ""}. Adquira mais créditos para continuar.`,
          });
        }
      }

      // Create campaign
      const campaignResult = await createCampaign({
        userId: ctx.user.id,
        sessionId: input.sessionId,
        name: input.name,
        message: input.message,
        totalContacts: phones.length,
        scheduledAt: input.scheduledAt,
      });

      const campaignId = (campaignResult as { insertId: number }).insertId;

      // Create contact records
      await createCampaignContacts(
        phones.map((phone) => ({ campaignId, phone, status: "pending" as const }))
      );

      // If scheduled for future, save as scheduled and return
      if (input.scheduledAt && input.scheduledAt > new Date()) {
        await updateCampaignStatus(campaignId, "scheduled");
        return { success: true, campaignId, scheduled: true };
      }

      // Pré-segmenta a copy uma única vez por campanha (free-text).
      // Templates não são chunkáveis (cada um é uma unidade aprovada).
      const blocks = input.useTemplate ? [] : chunkMessage(input.message);

      // Start sending asynchronously
      (async () => {
        await updateCampaignStatus(campaignId, "running");
        const contacts = await getCampaignContacts(campaignId);
        let successCount = 0;
        let errorCount = 0;

        for (const contact of contacts) {
          const isTemplate = !!(input.useTemplate && input.templateName);
          const result = isTemplate
            ? await sendWhatsAppTemplate(
                session.accessToken,
                session.phoneNumberId,
                contact.phone,
                input.templateName!,
                input.templateLanguage ?? "pt_BR",
                input.templateVariables ?? [],
                input.templateHeaderImageUrl
              )
            : await sendWhatsAppBlocks(
                session.accessToken,
                session.phoneNumberId,
                contact.phone,
                blocks
              );

          // Normaliza o id do primeiro bloco como messageId do contato.
          const firstMessageId = "messageIds" in result
            ? result.messageIds[0]
            : result.messageId;

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
            // Deduct 1 credit per successful send (admin exempt)
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

          // Anti-ban: random delay between messages (configurable)
          const delayMin = (input.delayMin ?? 3) * 1000;
          const delayMax = (input.delayMax ?? 8) * 1000;
          const delay = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
          await new Promise((r) => setTimeout(r, delay));

          // Auto-pause if error rate exceeds 30% after at least 10 messages
          const totalProcessed = successCount + errorCount;
          if (totalProcessed >= 10 && errorCount / totalProcessed > 0.3) {
            await updateCampaignStatus(campaignId, "failed");
            console.error(`[Campaign ${campaignId}] Auto-paused: error rate ${Math.round(errorCount / totalProcessed * 100)}% exceeded 30%`);
            return;
          }
        }

        const finalStatus = errorCount === contacts.length ? "failed" : "completed";
        await updateCampaignStatus(campaignId, finalStatus);
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
  dashboard: dashboardRouter,
  inbox: inboxRouter,
  automations: automationsRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
