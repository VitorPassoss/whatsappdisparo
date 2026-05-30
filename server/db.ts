import { and, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import {
  CampaignContact,
  InsertCampaignContact,
  InsertContactList,
  InsertContactListItem,
  InsertUser,
  InsertWhatsappSession,
  campaignContacts,
  campaigns,
  contactListItems,
  contactLists,
  users,
  whatsappSessions,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
let _rawPool: mysql.Pool | null = null;

export async function getDb() {
  if (!_db && ENV.databaseUrl) {
    try {
      _db = drizzle(ENV.databaseUrl);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/**
 * Acesso de baixo nível pra executar SQL cru — usado pelo módulo de
 * settings pra `CREATE TABLE IF NOT EXISTS` no boot, sem depender de
 * `drizzle-kit migrate` rodar primeiro.
 */
export async function getRawConnection(): Promise<mysql.Pool | null> {
  if (!_rawPool && ENV.databaseUrl) {
    try {
      _rawPool = mysql.createPool({
        uri: ENV.databaseUrl,
        connectionLimit: 5,
      });
    } catch (error) {
      console.warn("[Database] Failed to create raw pool:", error);
      _rawPool = null;
    }
  }
  return _rawPool;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (ENV.ownerOpenId && user.openId === ENV.ownerOpenId) {
    // Only promote to admin if ownerOpenId is explicitly set and matches
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserPasswordHash(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

// ─── WhatsApp Sessions ────────────────────────────────────────────────────────

export async function createSession(data: InsertWhatsappSession) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(whatsappSessions).values(data);
  return result;
}

export async function getSessionsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(whatsappSessions)
    .where(eq(whatsappSessions.userId, userId))
    .orderBy(desc(whatsappSessions.createdAt));
}

export async function getSessionById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(whatsappSessions)
    .where(and(eq(whatsappSessions.id, id), eq(whatsappSessions.userId, userId)))
    .limit(1);
  return result[0];
}

export async function deleteSession(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .delete(whatsappSessions)
    .where(and(eq(whatsappSessions.id, id), eq(whatsappSessions.userId, userId)));
}

export async function updateSessionWabaId(id: number, userId: number, wabaId: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(whatsappSessions)
    .set({ wabaId })
    .where(and(eq(whatsappSessions.id, id), eq(whatsappSessions.userId, userId)));
}

// ─── Contact Lists ────────────────────────────────────────────────────────────

export async function createContactList(data: InsertContactList) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(contactLists).values(data);
  return result;
}

export async function getContactListsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(contactLists)
    .where(eq(contactLists.userId, userId))
    .orderBy(desc(contactLists.createdAt));
}

export async function getContactListById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(contactLists)
    .where(and(eq(contactLists.id, id), eq(contactLists.userId, userId)))
    .limit(1);
  return result[0];
}

export async function updateContactListName(id: number, userId: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(contactLists)
    .set({ name })
    .where(and(eq(contactLists.id, id), eq(contactLists.userId, userId)));
}

export async function deleteContactList(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(contactListItems).where(eq(contactListItems.listId, id));
  await db
    .delete(contactLists)
    .where(and(eq(contactLists.id, id), eq(contactLists.userId, userId)));
}

export async function addContactsToList(items: InsertContactListItem[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (items.length === 0) return;
  await db.insert(contactListItems).values(items);
}

export async function getContactsByListId(listId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(contactListItems)
    .where(eq(contactListItems.listId, listId))
    .orderBy(contactListItems.createdAt);
}

export async function deleteContactFromList(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(contactListItems).where(eq(contactListItems.id, id));
}

// ─── Campaigns ────────────────────────────────────────────────────────────────

export async function createCampaign(data: {
  userId: number;
  sessionId: number;
  name: string;
  message: string;
  totalContacts: number;
  scheduledAt?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(campaigns).values({
    ...data,
    status: data.scheduledAt && data.scheduledAt > new Date() ? "scheduled" : "pending",
    scheduledAt: data.scheduledAt ?? null,
    sentCount: 0,
    successCount: 0,
    errorCount: 0,
    pendingCount: data.totalContacts,
  });
  return result;
}

export async function getCampaignsByUserId(
  userId: number,
  filters?: {
    status?: string;
    search?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }
) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(campaigns.userId, userId)];

  if (filters?.status && filters.status !== "all") {
    conditions.push(eq(campaigns.status, filters.status as "pending" | "running" | "completed" | "failed"));
  }
  if (filters?.search) {
    conditions.push(
      or(
        like(campaigns.name, `%${filters.search}%`),
        like(campaigns.message, `%${filters.search}%`)
      )!
    );
  }
  if (filters?.dateFrom) {
    conditions.push(gte(campaigns.createdAt, filters.dateFrom));
  }
  if (filters?.dateTo) {
    conditions.push(lte(campaigns.createdAt, filters.dateTo));
  }

  return db
    .select()
    .from(campaigns)
    .where(and(...conditions))
    .orderBy(desc(campaigns.createdAt));
}

export async function getCampaignById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)))
    .limit(1);
  return result[0];
}

export async function updateCampaignStatus(
  id: number,
  status: "pending" | "running" | "completed" | "failed" | "scheduled" | "cancelled",
  counts?: { sentCount?: number; successCount?: number; errorCount?: number; pendingCount?: number }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const updateData: Record<string, unknown> = { status };
  if (counts) Object.assign(updateData, counts);
  if (status === "completed" || status === "failed") {
    updateData.completedAt = new Date();
  }
  await db.update(campaigns).set(updateData).where(eq(campaigns.id, id));
}

export async function incrementCampaignCounts(
  id: number,
  delta: { sentCount?: number; successCount?: number; errorCount?: number; pendingCount?: number }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const updates: Record<string, unknown> = {};
  if (delta.sentCount) updates.sentCount = sql`sentCount + ${delta.sentCount}`;
  if (delta.successCount) updates.successCount = sql`successCount + ${delta.successCount}`;
  if (delta.errorCount) updates.errorCount = sql`errorCount + ${delta.errorCount}`;
  if (delta.pendingCount !== undefined) updates.pendingCount = sql`pendingCount + ${delta.pendingCount}`;
  if (Object.keys(updates).length > 0) {
    await db.update(campaigns).set(updates).where(eq(campaigns.id, id));
  }
}

// ─── Campaign Contacts ────────────────────────────────────────────────────────

export async function createCampaignContacts(contacts: InsertCampaignContact[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (contacts.length === 0) return;
  // Insert in batches of 100
  for (let i = 0; i < contacts.length; i += 100) {
    await db.insert(campaignContacts).values(contacts.slice(i, i + 100));
  }
}

export async function getCampaignContacts(
  campaignId: number,
  statusFilter?: string
) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(campaignContacts.campaignId, campaignId)];
  if (statusFilter && statusFilter !== "all") {
    conditions.push(
      eq(campaignContacts.status, statusFilter as CampaignContact["status"])
    );
  }
  return db
    .select()
    .from(campaignContacts)
    .where(and(...conditions))
    .orderBy(campaignContacts.createdAt);
}

export async function updateContactStatus(
  id: number,
  status: CampaignContact["status"],
  data?: { errorMessage?: string; messageId?: string; sentAt?: Date }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const updateData: Record<string, unknown> = { status };
  if (data?.errorMessage !== undefined) updateData.errorMessage = data.errorMessage;
  if (data?.messageId !== undefined) updateData.messageId = data.messageId;
  if (data?.sentAt !== undefined) updateData.sentAt = data.sentAt;
  await db.update(campaignContacts).set(updateData).where(eq(campaignContacts.id, id));
}

export async function getDashboardStats(userId: number) {
  const db = await getDb();
  if (!db) return { totalSent: 0, totalSuccess: 0, totalErrors: 0, totalPending: 0, totalCampaigns: 0 };

  const result = await db
    .select({
      totalSent: sql<number>`COALESCE(SUM(sentCount), 0)`,
      totalSuccess: sql<number>`COALESCE(SUM(successCount), 0)`,
      totalErrors: sql<number>`COALESCE(SUM(errorCount), 0)`,
      totalPending: sql<number>`COALESCE(SUM(pendingCount), 0)`,
      totalCampaigns: sql<number>`COUNT(*)`,
    })
    .from(campaigns)
    .where(eq(campaigns.userId, userId));

  return result[0] ?? { totalSent: 0, totalSuccess: 0, totalErrors: 0, totalPending: 0, totalCampaigns: 0 };
}

// ─── Inbox / Conversations ────────────────────────────────────────────────────

import {
  conversations,
  inboxMessages,
  Conversation,
  InsertConversation,
  InboxMessage,
  InsertInboxMessage,
} from "../drizzle/schema";

export async function getOrCreateConversation(
  userId: number,
  sessionId: number,
  phone: string,
  contactName?: string
): Promise<Conversation> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const existing = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.sessionId, sessionId), eq(conversations.phone, phone)))
    .limit(1);

  if (existing.length > 0) return existing[0];

  await db.insert(conversations).values({
    userId,
    sessionId,
    phone,
    contactName: contactName ?? null,
    lastMessageAt: new Date(),
  });

  const created = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.sessionId, sessionId), eq(conversations.phone, phone)))
    .limit(1);

  return created[0];
}

export async function getConversationsBySession(sessionId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(conversations)
    .where(and(eq(conversations.sessionId, sessionId), eq(conversations.userId, userId)))
    .orderBy(sql`lastMessageAt DESC`);
}

export async function getConversationsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(sql`lastMessageAt DESC`);
}

export async function getMessagesByConversation(conversationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(inboxMessages)
    .where(eq(inboxMessages.conversationId, conversationId))
    .orderBy(inboxMessages.createdAt);
}

export async function createInboxMessage(msg: InsertInboxMessage): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(inboxMessages).values(msg);
}

export async function updateConversationLastMessage(
  conversationId: number,
  lastMessage: string,
  incrementUnread = false
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(conversations)
    .set({
      lastMessage,
      lastMessageAt: new Date(),
      ...(incrementUnread ? { unreadCount: sql`unreadCount + 1` } : {}),
    })
    .where(eq(conversations.id, conversationId));
}

export async function markConversationRead(conversationId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(conversations)
    .set({ unreadCount: 0 })
    .where(eq(conversations.id, conversationId));
}

export async function getTotalUnreadCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(unreadCount), 0)` })
    .from(conversations)
    .where(eq(conversations.userId, userId));
  return result[0]?.total ?? 0;
}

// ─── Automações / Funis ───────────────────────────────────────────────────────

import {
  automations,
  automationSteps,
  automationLogs,
  Automation,
  InsertAutomation,
  AutomationStep,
  InsertAutomationStep,
} from "../drizzle/schema";

export async function createAutomation(data: InsertAutomation): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(automations).values(data);
  return (result as { insertId: number }).insertId;
}

export async function getAutomationsByUserId(userId: number): Promise<(Automation & { steps: AutomationStep[] })[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(automations)
    .where(eq(automations.userId, userId))
    .orderBy(desc(automations.createdAt));

  // Load steps for each automation
  const result: (Automation & { steps: AutomationStep[] })[] = [];
  for (const auto of rows) {
    const steps = await db
      .select()
      .from(automationSteps)
      .where(eq(automationSteps.automationId, auto.id))
      .orderBy(automationSteps.stepOrder);
    result.push({ ...auto, steps });
  }
  return result;
}

export async function getAutomationById(id: number, userId: number): Promise<(Automation & { steps: AutomationStep[] }) | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(automations)
    .where(and(eq(automations.id, id), eq(automations.userId, userId)))
    .limit(1);
  if (!rows.length) return undefined;
  const steps = await db
    .select()
    .from(automationSteps)
    .where(eq(automationSteps.automationId, id))
    .orderBy(automationSteps.stepOrder);
  return { ...rows[0], steps };
}

export async function updateAutomation(
  id: number,
  userId: number,
  data: { name?: string; trigger?: string; triggerType?: "contains" | "exact" | "starts_with"; isActive?: "0" | "1" }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(automations)
    .set(data)
    .where(and(eq(automations.id, id), eq(automations.userId, userId)));
}

export async function deleteAutomation(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(automationSteps).where(eq(automationSteps.automationId, id));
  await db.delete(automationLogs).where(eq(automationLogs.automationId, id));
  await db.delete(automations).where(and(eq(automations.id, id), eq(automations.userId, userId)));
}

export async function setAutomationSteps(automationId: number, steps: { message: string; delaySeconds: number }[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Delete existing steps and re-insert
  await db.delete(automationSteps).where(eq(automationSteps.automationId, automationId));
  if (steps.length > 0) {
    await db.insert(automationSteps).values(
      steps.map((s, i) => ({
        automationId,
        stepOrder: i + 1,
        message: s.message,
        delaySeconds: s.delaySeconds,
      }))
    );
  }
}

// Get active automations for a session (for webhook matching)
export async function getActiveAutomationsForSession(sessionId: number): Promise<(Automation & { steps: AutomationStep[] })[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(automations)
    .where(and(eq(automations.sessionId, sessionId), eq(automations.isActive, "1")));

  const result: (Automation & { steps: AutomationStep[] })[] = [];
  for (const auto of rows) {
    const steps = await db
      .select()
      .from(automationSteps)
      .where(eq(automationSteps.automationId, auto.id))
      .orderBy(automationSteps.stepOrder);
    result.push({ ...auto, steps });
  }
  return result;
}

// Check if a phone already received this automation (within last 24h to avoid spam)
export async function hasAutomationBeenSent(automationId: number, sessionId: number, phone: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(automationLogs)
    .where(
      and(
        eq(automationLogs.automationId, automationId),
        eq(automationLogs.sessionId, sessionId),
        eq(automationLogs.phone, phone),
        gte(automationLogs.triggeredAt, since)
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function logAutomationSent(automationId: number, sessionId: number, phone: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(automationLogs).values({ automationId, sessionId, phone });
}

// ─── Credits ──────────────────────────────────────────────────────────────────

export async function getUserCredits(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ credits: users.credits }).from(users).where(eq(users.id, userId)).limit(1);
  return result.length > 0 ? (result[0].credits ?? 0) : 0;
}

export async function deductCredits(userId: number, amount: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const current = await getUserCredits(userId);
  if (current < amount) return false;
  await db.update(users).set({ credits: current - amount }).where(eq(users.id, userId));
  return true;
}

export async function addCredits(userId: number, amount: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const current = await getUserCredits(userId);
  await db.update(users).set({ credits: current + amount }).where(eq(users.id, userId));
}

export async function setCredits(userId: number, amount: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ credits: Math.max(0, amount) }).where(eq(users.id, userId));
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      credits: users.credits,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users)
    .orderBy(users.createdAt);
}

export async function setUserRole(userId: number, role: "user" | "admin"): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

/**
 * Conta admins. Usado pra detectar instalação nova (zero admins) e
 * auto-promover o primeiro usuário que logar.
 */
export async function countAdmins(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(users)
    .where(eq(users.role, "admin"));
  return Number(rows[0]?.count ?? 0);
}
