/**
 * WhatsApp Cloud API send helpers.
 *
 * Shared between the live dispatch flow (routers.ts) and the scheduled
 * worker (scheduledWorker.ts) so both paths stay in sync.
 *
 * Key responsibilities:
 *  - Hit the Graph API for text / template messages.
 *  - Split arbitrarily long copy into ordered blocks ("coexistência")
 *    that fit the per-message hard limit and arrive in the right order.
 *  - Sequence those blocks per recipient with a small intra-block delay
 *    to preserve order on the device and avoid burst throttling.
 */

const GRAPH_API_VERSION = "v19.0";

// WhatsApp Cloud API hard limit for the `text.body` field in a single message.
// We chunk anything longer than this so the user can send unlimited copy
// straight from the dispatch input.
export const WHATSAPP_TEXT_MAX = 4096;

// Convention: a line containing only "---" (optionally surrounded by spaces)
// is treated as an explicit block boundary, so the user can force how the
// copy is segmented from the dispatch input itself.
const EXPLICIT_BLOCK_SEPARATOR = /\r?\n[ \t]*---+[ \t]*\r?\n/g;

export type SendResult = {
  success: boolean;
  messageId?: string;
  error?: string;
};

export type BlocksSendResult = {
  success: boolean;
  messageIds: string[];
  error?: string;
  failedBlockIndex?: number;
};

/**
 * Split a long copy into ordered, send-ready blocks.
 *
 * 1. Honor explicit "---" line separators when present.
 * 2. For every resulting segment still over `max`, sub-chunk by
 *    paragraph → sentence → word → hard cut as last resort, always
 *    preserving the original character order.
 */
export function chunkMessage(text: string, max: number = WHATSAPP_TEXT_MAX): string[] {
  if (!text || !text.trim()) return [];

  const explicit = text
    .split(EXPLICIT_BLOCK_SEPARATOR)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const segments = explicit.length > 0 ? explicit : [text];

  const blocks: string[] = [];
  for (const segment of segments) {
    if (segment.length <= max) {
      blocks.push(segment);
      continue;
    }

    let remaining = segment;
    while (remaining.length > max) {
      const cut = findCutPoint(remaining, max);
      blocks.push(remaining.slice(0, cut).trimEnd());
      remaining = remaining.slice(cut).trimStart();
    }
    if (remaining.length > 0) blocks.push(remaining);
  }

  return blocks;
}

function findCutPoint(text: string, max: number): number {
  // Prefer a paragraph break in the second half of the window.
  const para = text.lastIndexOf("\n\n", max);
  if (para > max * 0.5) return para + 2;

  // Then a sentence / line break.
  const sentence = Math.max(
    text.lastIndexOf(". ", max),
    text.lastIndexOf("! ", max),
    text.lastIndexOf("? ", max),
    text.lastIndexOf("\n", max),
  );
  if (sentence > max * 0.5) return sentence + 1;

  // Then a word boundary.
  const space = text.lastIndexOf(" ", max);
  if (space > max * 0.5) return space + 1;

  // Hard cut as last resort.
  return max;
}

export async function sendWhatsAppMessage(
  accessToken: string,
  phoneNumberId: string,
  to: string,
  message: string,
): Promise<SendResult> {
  const phone = to.replace(/\D/g, "");

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: phone,
          type: "text",
          text: { preview_url: false, body: message },
        }),
      },
    );

    const data = (await res.json()) as {
      messages?: { id: string }[];
      error?: { message: string; code: number };
    };

    if (!res.ok || data.error) {
      return {
        success: false,
        error: data.error?.message ?? `HTTP ${res.status}`,
      };
    }

    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

export async function sendWhatsAppTemplate(
  accessToken: string,
  phoneNumberId: string,
  to: string,
  templateName: string,
  languageCode: string,
  variables: string[],
  headerImageUrl?: string,
): Promise<SendResult> {
  const phone = to.replace(/\D/g, "");

  const components: object[] = [];
  if (headerImageUrl) {
    components.push({
      type: "header",
      parameters: [{ type: "image", image: { link: headerImageUrl } }],
    });
  }
  if (variables.length > 0) {
    components.push({
      type: "body",
      parameters: variables.map((v) => ({ type: "text", text: v })),
    });
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: phone,
          type: "template",
          template: {
            name: templateName,
            language: { code: languageCode },
            components: components.length > 0 ? components : undefined,
          },
        }),
      },
    );

    const data = (await res.json()) as {
      messages?: { id: string }[];
      error?: { message: string; code: number };
    };

    if (!res.ok || data.error) {
      return { success: false, error: data.error?.message ?? `HTTP ${res.status}` };
    }
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/**
 * Sequentially dispatch all `blocks` to a single recipient, preserving
 * order. Stops at the first failed block and reports which one failed
 * so the contact can be marked accordingly.
 *
 * The small `intraBlockDelayMs` between consecutive POSTs is what
 * keeps the messages from arriving out of order on the device when
 * the user is sending long, multi-block copy.
 */
export async function sendWhatsAppBlocks(
  accessToken: string,
  phoneNumberId: string,
  to: string,
  blocks: string[],
  intraBlockDelayMs: number = 800,
): Promise<BlocksSendResult> {
  if (blocks.length === 0) {
    return { success: false, messageIds: [], error: "Mensagem vazia" };
  }

  const messageIds: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const result = await sendWhatsAppMessage(accessToken, phoneNumberId, to, blocks[i]);
    if (!result.success) {
      return {
        success: false,
        messageIds,
        error: `Bloco ${i + 1}/${blocks.length}: ${result.error ?? "erro desconhecido"}`,
        failedBlockIndex: i,
      };
    }
    if (result.messageId) messageIds.push(result.messageId);

    if (i < blocks.length - 1) {
      await new Promise((r) => setTimeout(r, intraBlockDelayMs));
    }
  }

  return { success: true, messageIds };
}
