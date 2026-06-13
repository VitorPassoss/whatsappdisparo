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

// Chips / números Evolution API (WhatsApp não-oficial via Baileys).
// Cada linha = uma instância da Evolution conectada por QR code.
export const evolutionInstances = mysqlTable("evolution_instances", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  // Rótulo amigável exibido na UI ("Chip 01", "Vendas SP"...).
  name: varchar("name", { length: 128 }).notNull(),
  // Nome único da instância dentro do servidor Evolution (slug técnico).
  instanceName: varchar("instanceName", { length: 128 }).notNull().unique(),
  // Número conectado (lido do perfil após o scan do QR).
  phone: varchar("phone", { length: 32 }),
  profileName: varchar("profileName", { length: 128 }),
  status: mysqlEnum("status", ["disconnected", "connecting", "connected"]).default("disconnected").notNull(),
  // Teto diário de envios deste chip (contingência anti-ban).
  dailyLimit: int("dailyLimit").default(80).notNull(),
  sentToday: int("sentToday").default(0).notNull(),
  sentTotal: int("sentTotal").default(0).notNull(),
  lastSentAt: timestamp("lastSentAt"),
  // Marca o início da janela diária corrente, pra zerar sentToday a cada 24h.
  dailyResetAt: timestamp("dailyResetAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EvolutionInstance = typeof evolutionInstances.$inferSelect;
export type InsertEvolutionInstance = typeof evolutionInstances.$inferInsert;

// Campanhas de disparo
export const campaigns = mysqlTable("campaigns", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  // Nullable: campanhas Evolution usam múltiplos chips, não uma única sessão.
  sessionId: int("sessionId"),
  // Motor de envio: API oficial Meta ou Evolution (não-oficial multi-chip).
  engine: mysqlEnum("engine", ["official", "evolution"]).default("official").notNull(),
  // IDs dos chips Evolution usados nesta campanha (JSON array). Null no oficial.
  evolutionInstanceIds: text("evolutionInstanceIds"),
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
  // Variáveis dinâmicas por contato (do CSV), guardadas como JSON: ["João","link",...]
  variables: text("variables"),
  // Em campanhas Evolution, qual chip (instanceName) efetivamente enviou.
  instanceName: varchar("instanceName", { length: 128 }),
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

// Configurações editáveis em runtime via UI admin.
// Substituem variáveis de ambiente que mudavam com frequência
// (Facebook App ID/Secret, webhook token, origem pública etc).
// O DATABASE_URL e JWT_SECRET permanecem no .env por serem
// dependências de bootstrap.
export const appSettings = mysqlTable("app_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = typeof appSettings.$inferInsert;

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
