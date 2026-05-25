import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  bigint,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  credits: int("credits").default(50).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Sessões WhatsApp (Token + Phone Number ID)
export const whatsappSessions = mysqlTable("whatsapp_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 128 }).notNull().default("Sessão Principal"),
  accessToken: text("accessToken").notNull(),
  phoneNumberId: varchar("phoneNumberId", { length: 64 }).notNull(),
  wabaId: varchar("wabaId", { length: 64 }),
  isActive: mysqlEnum("isActive", ["0", "1"]).default("1").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WhatsappSession = typeof whatsappSessions.$inferSelect;
export type InsertWhatsappSession = typeof whatsappSessions.$inferInsert;

// Listas de contatos
export const contactLists = mysqlTable("contact_lists", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ContactList = typeof contactLists.$inferSelect;
export type InsertContactList = typeof contactLists.$inferInsert;

// Itens das listas de contatos
export const contactListItems = mysqlTable("contact_list_items", {
  id: int("id").autoincrement().primaryKey(),
  listId: int("listId").notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  name: varchar("name", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ContactListItem = typeof contactListItems.$inferSelect;
export type InsertContactListItem = typeof contactListItems.$inferInsert;

// Campanhas de disparo
export const campaigns = mysqlTable("campaigns", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  sessionId: int("sessionId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  message: text("message").notNull(),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed", "scheduled", "cancelled"]).default("pending").notNull(),
  scheduledAt: timestamp("scheduledAt"),
  totalContacts: int("totalContacts").default(0).notNull(),
  sentCount: int("sentCount").default(0).notNull(),
  successCount: int("successCount").default(0).notNull(),
  errorCount: int("errorCount").default(0).notNull(),
  pendingCount: int("pendingCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = typeof campaigns.$inferInsert;

// Contatos individuais de cada campanha
export const campaignContacts = mysqlTable("campaign_contacts", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  name: varchar("name", { length: 128 }),
  status: mysqlEnum("status", ["pending", "sent", "delivered", "read", "failed"]).default("pending").notNull(),
  errorMessage: text("errorMessage"),
  messageId: varchar("messageId", { length: 128 }),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CampaignContact = typeof campaignContacts.$inferSelect;
export type InsertCampaignContact = typeof campaignContacts.$inferInsert;

// Conversas do Inbox (mensagens recebidas de clientes)
export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  sessionId: int("sessionId").notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  contactName: varchar("contactName", { length: 128 }),
  lastMessage: text("lastMessage"),
  lastMessageAt: timestamp("lastMessageAt").defaultNow().notNull(),
  unreadCount: int("unreadCount").default(0).notNull(),
  status: mysqlEnum("status", ["open", "closed"]).default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

// Mensagens do Inbox
export const inboxMessages = mysqlTable("inbox_messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  sessionId: int("sessionId").notNull(),
  waMessageId: varchar("waMessageId", { length: 128 }),
  direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  body: text("body").notNull(),
  type: varchar("type", { length: 32 }).default("text").notNull(),
  status: mysqlEnum("status", ["received", "sent", "delivered", "read", "failed"]).default("received").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InboxMessage = typeof inboxMessages.$inferSelect;
export type InsertInboxMessage = typeof inboxMessages.$inferInsert;

// Automações / Funis de Resposta
export const automations = mysqlTable("automations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  sessionId: int("sessionId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  trigger: varchar("trigger", { length: 256 }).notNull(), // palavra-chave que dispara o funil
  triggerType: mysqlEnum("triggerType", ["contains", "exact", "starts_with"]).default("contains").notNull(),
  isActive: mysqlEnum("isActive", ["0", "1"]).default("1").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Automation = typeof automations.$inferSelect;
export type InsertAutomation = typeof automations.$inferInsert;

// Passos do funil de automação
export const automationSteps = mysqlTable("automation_steps", {
  id: int("id").autoincrement().primaryKey(),
  automationId: int("automationId").notNull(),
  stepOrder: int("stepOrder").notNull().default(1),
  message: text("message").notNull(),
  delaySeconds: int("delaySeconds").notNull().default(0), // delay antes de enviar este passo
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AutomationStep = typeof automationSteps.$inferSelect;
export type InsertAutomationStep = typeof automationSteps.$inferInsert;

// Registro de contatos que já receberam um funil (evita reenvio)
export const automationLogs = mysqlTable("automation_logs", {
  id: int("id").autoincrement().primaryKey(),
  automationId: int("automationId").notNull(),
  sessionId: int("sessionId").notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  triggeredAt: timestamp("triggeredAt").defaultNow().notNull(),
});

export type AutomationLog = typeof automationLogs.$inferSelect;
export type InsertAutomationLog = typeof automationLogs.$inferInsert;
