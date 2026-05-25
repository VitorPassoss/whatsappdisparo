/**
 * Scheduled Dispatch Worker
 * Polls every 60 seconds for campaigns with status='scheduled' whose scheduledAt <= now
 * and triggers the send flow for each one.
 */

import { getDb } from "./db";
import { campaigns } from "../drizzle/schema";
import { and, eq, lte } from "drizzle-orm";
import {
  getCampaignContacts,
  getSessionById,
  incrementCampaignCounts,
  updateCampaignStatus,
  updateContactStatus,
} from "./db";
import {
  chunkMessage,
  sendWhatsAppBlocks,
  sendWhatsAppTemplate,
} from "./whatsapp-send";

// ─── Worker ───────────────────────────────────────────────────────────────────

async function runScheduledCampaigns() {
  const db = await getDb();
  if (!db) return;

  // Find campaigns that are scheduled and due
  const due = await db
    .select()
    .from(campaigns)
    .where(
      and(
        eq(campaigns.status, "scheduled"),
        lte(campaigns.scheduledAt, new Date())
      )
    );

  for (const campaign of due) {
    console.log(`[ScheduledWorker] Starting campaign ${campaign.id}: ${campaign.name}`);

    try {
      // Mark as running
      await updateCampaignStatus(campaign.id, "running");

      const session = await getSessionById(campaign.sessionId, campaign.userId);
      if (!session) {
        await updateCampaignStatus(campaign.id, "failed");
        console.error(`[ScheduledWorker] Session not found for campaign ${campaign.id}`);
        continue;
      }

      const contacts = await getCampaignContacts(campaign.id);
      let successCount = 0;
      let errorCount = 0;

      // Detect if message is a template reference
      const templateMatch = campaign.message.match(/^\[Template: (.+)\]$/);
      const isTemplate = !!templateMatch;
      const templateName = templateMatch?.[1] ?? "";

      // Pré-segmenta a copy para envios em blocos sequenciais.
      const blocks = isTemplate ? [] : chunkMessage(campaign.message);

      for (const contact of contacts) {
        const result = isTemplate
          ? await sendWhatsAppTemplate(
              session.accessToken,
              session.phoneNumberId,
              contact.phone,
              templateName,
              "pt_BR",
              []
            )
          : await sendWhatsAppBlocks(
              session.accessToken,
              session.phoneNumberId,
              contact.phone,
              blocks
            );

        const firstMessageId = "messageIds" in result
          ? result.messageIds[0]
          : result.messageId;

        if (result.success) {
          successCount++;
          await updateContactStatus(contact.id, "sent", {
            messageId: firstMessageId,
            sentAt: new Date(),
          });
          await incrementCampaignCounts(campaign.id, {
            sentCount: 1,
            successCount: 1,
            pendingCount: -1,
          });
        } else {
          errorCount++;
          await updateContactStatus(contact.id, "failed", {
            errorMessage: result.error,
          });
          await incrementCampaignCounts(campaign.id, {
            sentCount: 1,
            errorCount: 1,
            pendingCount: -1,
          });
        }

        // Anti-ban delay (3-8s)
        const delay = Math.floor(Math.random() * 5000) + 3000;
        await new Promise((r) => setTimeout(r, delay));
      }

      const finalStatus = errorCount === contacts.length ? "failed" : "completed";
      await updateCampaignStatus(campaign.id, finalStatus);
      console.log(`[ScheduledWorker] Campaign ${campaign.id} finished: ${finalStatus}`);
    } catch (err) {
      console.error(`[ScheduledWorker] Error in campaign ${campaign.id}:`, err);
      await updateCampaignStatus(campaign.id, "failed").catch(console.error);
    }
  }
}

export function startScheduledWorker() {
  console.log("[ScheduledWorker] Started — checking every 60s for scheduled campaigns");
  // Run immediately on startup, then every 60 seconds
  runScheduledCampaigns().catch(console.error);
  setInterval(() => {
    runScheduledCampaigns().catch(console.error);
  }, 60_000);
}
