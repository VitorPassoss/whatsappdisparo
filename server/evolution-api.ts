/**
 * Evolution API client + dispatch helpers.
 *
 * Evolution API is an unofficial WhatsApp gateway (Baileys / WhatsApp Web
 * under the hood). Unlike the official Meta Cloud API, there are no approved
 * templates: you send free-text "copy" straight from a connected number
 * ("chip"). Each chip is one Evolution *instance* connected via QR code.
 *
 * This module mirrors `whatsapp-send.ts` (the official path) so the dispatch
 * flow and the UI stay conceptually identical ("igual o da API oficial").
 *
 * Responsibilities:
 *  - Instance lifecycle: create / connect (QR) / state / logout / delete.
 *  - Send text & media to a single recipient through a given instance.
 *  - Contingency/anti-ban primitives reused by the multi-chip dispatcher:
 *      · spintax  {opção1|opção2}      → varia a copy a cada envio
 *      · variáveis {{1}}..{{n}}        → personaliza com colunas do CSV
 *      · chunk de copy longa em blocos ordenados ("coexistência")
 *      · typing/presence simulado via `delay` antes de cada mensagem
 *
 * The Evolution server base URL + global apikey live in app settings
 * (admin-level) since one server hosts every user's chips.
 */

// Evolution v2 caps a single text message well above this, but we keep the
// same hard chunk size as the official path so long copy is split the same way.
export const EVOLUTION_TEXT_MAX = 4096;

const EXPLICIT_BLOCK_SEPARATOR = /\r?\n[ \t]*---+[ \t]*\r?\n/g;

export type EvoConfig = { baseUrl: string; apiKey: string };

export type EvoSendResult = {
  success: boolean;
  messageId?: string;
  error?: string;
};

export type EvoBlocksSendResult = {
  success: boolean;
  messageIds: string[];
  error?: string;
  failedBlockIndex?: number;
};

// ─── Low-level HTTP ─────────────────────────────────────────────────────────

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

async function evoFetch(
  config: EvoConfig,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{ ok: boolean; status: number; data: any }> {
  const url = `${normalizeBaseUrl(config.baseUrl)}${path}`;
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      apikey: config.apiKey,
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

function extractError(data: any, status: number): string {
  if (!data) return `HTTP ${status}`;
  if (typeof data === "string") return data;
  if (typeof data.message === "string") return data.message;
  if (Array.isArray(data.message)) return data.message.join("; ");
  if (typeof data.error === "string") return data.error;
  if (data.response?.message) {
    const m = data.response.message;
    return Array.isArray(m) ? m.join("; ") : String(m);
  }
  // Último recurso: serializa o corpo (truncado) pra não esconder o erro real.
  try {
    const json = JSON.stringify(data);
    if (json && json !== "{}") return `HTTP ${status}: ${json.slice(0, 300)}`;
  } catch {
    /* ignora */
  }
  return `HTTP ${status}`;
}

// ─── Instance lifecycle ─────────────────────────────────────────────────────

export type EvoConnectionState = "open" | "connecting" | "close" | "unknown";

export type EvoQrResult = {
  success: boolean;
  /** data URI base64 do QR code (image/png), pronto pra <img src>. */
  base64?: string;
  /** pairing code numérico (alternativa ao QR em alguns aparelhos). */
  pairingCode?: string;
  state?: EvoConnectionState;
  error?: string;
};

/**
 * Cria uma instância no servidor Evolution. Idempotente o suficiente: se a
 * instância já existir, a Evolution costuma retornar 403/409 — tratamos como
 * "já existe" e seguimos pro connect.
 */
export async function evoCreateInstance(
  config: EvoConfig,
  instanceName: string,
): Promise<{ success: boolean; alreadyExists?: boolean; error?: string }> {
  const { ok, status, data } = await evoFetch(config, "/instance/create", {
    method: "POST",
    body: {
      instanceName,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
    },
  });
  if (ok) return { success: true };
  // 403/409 normalmente = nome já em uso.
  if (status === 403 || status === 409) {
    return { success: true, alreadyExists: true };
  }
  const msg = extractError(data, status);
  if (/already in use|already exists|já existe/i.test(msg)) {
    return { success: true, alreadyExists: true };
  }
  return { success: false, error: msg };
}

function pickQrBase64(data: any): string | undefined {
  // Evolution v2 retorna formatos variados conforme a rota/versão.
  const raw =
    data?.base64 ??
    data?.qrcode?.base64 ??
    data?.qrcode ??
    data?.qr ??
    undefined;
  if (!raw || typeof raw !== "string") return undefined;
  return raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`;
}

/**
 * Pede o QR code (ou pairing code) pra conectar a instância. Chamado em
 * polling pela UI até o estado virar "open".
 */
export async function evoConnect(
  config: EvoConfig,
  instanceName: string,
): Promise<EvoQrResult> {
  const { ok, status, data } = await evoFetch(
    config,
    `/instance/connect/${encodeURIComponent(instanceName)}`,
  );
  if (!ok) return { success: false, error: extractError(data, status) };

  const base64 = pickQrBase64(data);
  const pairingCode = data?.pairingCode ?? data?.code ?? undefined;
  // Quando já conectado, a Evolution responde sem QR e com instance.state=open.
  const state = (data?.instance?.state ?? (base64 ? "connecting" : "unknown")) as EvoConnectionState;
  return { success: true, base64, pairingCode, state };
}

export async function evoConnectionState(
  config: EvoConfig,
  instanceName: string,
): Promise<{ success: boolean; state: EvoConnectionState; error?: string }> {
  const { ok, status, data } = await evoFetch(
    config,
    `/instance/connectionState/${encodeURIComponent(instanceName)}`,
  );
  if (!ok) return { success: false, state: "unknown", error: extractError(data, status) };
  const state = (data?.instance?.state ?? data?.state ?? "unknown") as EvoConnectionState;
  return { success: true, state };
}

/** Lê metadados (número/nome do perfil) da instância conectada. */
export async function evoFetchInstance(
  config: EvoConfig,
  instanceName: string,
): Promise<{ phone?: string; profileName?: string; state?: EvoConnectionState }> {
  const { ok, data } = await evoFetch(
    config,
    `/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
  );
  if (!ok) return {};
  const arr = Array.isArray(data) ? data : data ? [data] : [];
  const inst = arr[0]?.instance ?? arr[0] ?? {};
  const ownerJid: string | undefined = inst.owner ?? inst.ownerJid ?? inst.wuid;
  const phone = ownerJid ? ownerJid.replace(/\D/g, "").slice(0, 15) : undefined;
  const profileName = inst.profileName ?? inst.profileName ?? undefined;
  const state = (inst.connectionStatus ?? inst.state) as EvoConnectionState | undefined;
  return { phone, profileName, state };
}

export async function evoLogout(config: EvoConfig, instanceName: string): Promise<void> {
  await evoFetch(config, `/instance/logout/${encodeURIComponent(instanceName)}`, {
    method: "DELETE",
  });
}

export async function evoDeleteInstance(config: EvoConfig, instanceName: string): Promise<void> {
  // Tenta logout antes de deletar pra liberar a sessão limpa.
  await evoLogout(config, instanceName).catch(() => {});
  await evoFetch(config, `/instance/delete/${encodeURIComponent(instanceName)}`, {
    method: "DELETE",
  });
}

// ─── Number validation ──────────────────────────────────────────────────────

/**
 * Checa quais números têm WhatsApp ativo. Evita gastar reputação do chip
 * disparando pra número inexistente. Retorna o conjunto de números válidos
 * (apenas dígitos). Em caso de erro, retorna null → o chamador segue sem filtrar.
 */
export async function evoWhatsappNumbers(
  config: EvoConfig,
  instanceName: string,
  numbers: string[],
): Promise<Set<string> | null> {
  if (numbers.length === 0) return new Set();
  const { ok, data } = await evoFetch(
    config,
    `/chat/whatsappNumbers/${encodeURIComponent(instanceName)}`,
    { method: "POST", body: { numbers } },
  );
  if (!ok || !Array.isArray(data)) return null;
  const valid = new Set<string>();
  for (const entry of data) {
    if (entry?.exists) {
      const n = String(entry.number ?? entry.jid ?? "").replace(/\D/g, "");
      if (n) valid.add(n);
    }
  }
  return valid;
}

// ─── Copy helpers: spintax + variables + chunking ───────────────────────────

/**
 * Resolve spintax `{a|b|c}` escolhendo uma opção por grupo. Suporta
 * aninhamento simples resolvendo de dentro pra fora. `rand` é injetável
 * (0..1) pra manter determinismo testável.
 */
export function applySpintax(text: string, rand: () => number = Math.random): string {
  let out = text;
  // Loop até não haver mais grupos `{...|...}` sem chaves internas.
  const group = /\{([^{}]*\|[^{}]*)\}/;
  let guard = 0;
  while (group.test(out) && guard < 1000) {
    out = out.replace(group, (_m, inner: string) => {
      const options = inner.split("|");
      return options[Math.floor(rand() * options.length)] ?? "";
    });
    guard++;
  }
  return out;
}

/** Substitui {{1}}, {{2}}... pelos valores do contato (1-indexed). */
export function applyVariables(text: string, variables: string[]): string {
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, d: string) => {
    const idx = parseInt(d, 10) - 1;
    return variables[idx] ?? "";
  });
}

/** Quebra copy longa em blocos ordenados (mesma lógica do path oficial). */
export function chunkMessage(text: string, max: number = EVOLUTION_TEXT_MAX): string[] {
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
  const para = text.lastIndexOf("\n\n", max);
  if (para > max * 0.5) return para + 2;
  const sentence = Math.max(
    text.lastIndexOf(". ", max),
    text.lastIndexOf("! ", max),
    text.lastIndexOf("? ", max),
    text.lastIndexOf("\n", max),
  );
  if (sentence > max * 0.5) return sentence + 1;
  const space = text.lastIndexOf(" ", max);
  if (space > max * 0.5) return space + 1;
  return max;
}

// ─── Send ───────────────────────────────────────────────────────────────────

function extractMessageId(data: any): string | undefined {
  return data?.key?.id ?? data?.messageId ?? data?.id ?? undefined;
}

/**
 * Envia um texto por uma instância. `typingDelayMs` aciona a simulação de
 * "digitando..." na Evolution (presença composing por esse tempo antes de
 * entregar) — uma técnica de contingência pra parecer humano.
 */
export async function evoSendText(
  config: EvoConfig,
  instanceName: string,
  to: string,
  text: string,
  typingDelayMs = 0,
): Promise<EvoSendResult> {
  const number = to.replace(/\D/g, "");
  const path = `/message/sendText/${encodeURIComponent(instanceName)}`;

  // A Evolution mudou o formato do payload entre a v1 e a v2. Tentamos o
  // formato v2 (flat) e, se falhar, caímos pro v1 (textMessage/options) —
  // assim funciona independente da versão que o usuário hospedou.
  const payloads: Record<string, unknown>[] = [
    // v2: { number, text, delay }
    { number, text, ...(typingDelayMs > 0 ? { delay: typingDelayMs } : {}) },
    // v1: { number, textMessage: { text }, options: { delay, presence } }
    {
      number,
      textMessage: { text },
      options: typingDelayMs > 0 ? { delay: typingDelayMs, presence: "composing" } : {},
    },
  ];

  let lastError = "Falha ao enviar";
  for (const body of payloads) {
    try {
      const { ok, status, data } = await evoFetch(config, path, { method: "POST", body });
      if (ok) return { success: true, messageId: extractMessageId(data) };
      lastError = extractError(data, status);
      // Erro de número inexistente / sem WhatsApp não é problema de formato —
      // não adianta tentar a outra versão.
      if (/exist|not found|invalid number|n[ãa]o.*whats|number.*not/i.test(lastError)) break;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : "Network error";
    }
  }
  console.error(`[Evolution] sendText falhou (${instanceName} → ${number}): ${lastError}`);
  return { success: false, error: lastError };
}

/**
 * Botão de uma mensagem interativa. A Evolution v2 aceita tipos mistos
 * (resposta rápida, link, ligação, copiar código) na mesma mensagem.
 */
export type EvoButton =
  | { type: "reply"; text: string }
  | { type: "url"; text: string; url: string }
  | { type: "call"; text: string; phone: string }
  | { type: "copy"; text: string; copyCode: string };

/**
 * Modo compatível: renderiza os botões como TEXTO dentro da mensagem em vez
 * de mandar um balão interativo. Mensagens interativas (sendButtons) são
 * bloqueadas pela Meta no WhatsApp Web/Baileys e mostram "não foi possível
 * carregar a mensagem" na maioria dos aparelhos. Em texto, o link vira
 * clicável (com preview) e renderiza 100%.
 */
export function renderButtonsAsText(
  description: string,
  buttons: EvoButton[],
  footer?: string,
): string {
  const parts: string[] = [];
  const body = description.trim();
  if (body) parts.push(body);

  const lines: string[] = [];
  for (const b of buttons) {
    if (b.type === "url") {
      // URL em linha própria → WhatsApp gera link clicável/preview.
      lines.push(`👉 *${b.text}*\n${b.url}`);
    } else if (b.type === "call") {
      lines.push(`📞 *${b.text}*: ${b.phone}`);
    } else {
      // Resposta rápida não tem equivalente clicável; vira uma opção em texto.
      lines.push(`▶️ ${b.text}`);
    }
  }
  if (lines.length) parts.push(lines.join("\n\n"));

  const f = footer?.trim();
  if (f) parts.push(`_${f}_`);

  return parts.join("\n\n");
}

/**
 * Envia uma mensagem com botões (CTA/resposta rápida) por uma instância.
 * `description` é o corpo da copy; `footer`/`title` são opcionais. WhatsApp
 * limita a 3 botões por mensagem.
 */
export async function evoSendButtons(
  config: EvoConfig,
  instanceName: string,
  to: string,
  opts: {
    description: string;
    title?: string;
    footer?: string;
    buttons: EvoButton[];
    typingDelayMs?: number;
  },
): Promise<EvoSendResult> {
  const number = to.replace(/\D/g, "");
  // Formato Evolution v2: cada botão tem `type` + `displayText` + campo extra.
  const buttons = opts.buttons.slice(0, 3).map((b, i) => {
    switch (b.type) {
      case "url":
        return { type: "url", displayText: b.text, url: b.url };
      case "call":
        return { type: "call", displayText: b.text, phoneNumber: b.phone };
      case "copy":
        return { type: "copy", displayText: b.text, copyCode: b.copyCode };
      default:
        return { type: "reply", displayText: b.text, id: String(i + 1) };
    }
  });

  try {
    const { ok, status, data } = await evoFetch(
      config,
      `/message/sendButtons/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        body: {
          number,
          // `title` é obrigatório no DTO da Evolution v2.3.x (SendButtonsDto).
          // Mandamos string vazia quando o usuário não define um título.
          title: opts.title ?? "",
          ...(opts.description ? { description: opts.description } : {}),
          ...(opts.footer ? { footer: opts.footer } : {}),
          buttons,
          ...(opts.typingDelayMs && opts.typingDelayMs > 0 ? { delay: opts.typingDelayMs } : {}),
        },
      },
    );
    if (!ok) {
      const err = extractError(data, status);
      console.error(`[Evolution] sendButtons falhou (${instanceName} → ${number}): ${err}`);
      return { success: false, error: err };
    }
    return { success: true, messageId: extractMessageId(data) };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

/** Envia uma mídia (imagem) com caption opcional por uma instância. */
export async function evoSendMedia(
  config: EvoConfig,
  instanceName: string,
  to: string,
  mediaUrl: string,
  caption: string | undefined,
  typingDelayMs = 0,
): Promise<EvoSendResult> {
  const number = to.replace(/\D/g, "");
  try {
    const { ok, status, data } = await evoFetch(
      config,
      `/message/sendMedia/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        body: {
          number,
          mediatype: "image",
          media: mediaUrl,
          ...(caption ? { caption } : {}),
          ...(typingDelayMs > 0 ? { delay: typingDelayMs } : {}),
        },
      },
    );
    if (!ok) return { success: false, error: extractError(data, status) };
    return { success: true, messageId: extractMessageId(data) };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

/**
 * Dispara todos os `blocks` em ordem pra um destinatário por uma instância,
 * parando no primeiro bloco que falhar. `intraBlockDelayMs` preserva a ordem
 * de chegada no aparelho em copy multi-bloco.
 */
export async function evoSendBlocks(
  config: EvoConfig,
  instanceName: string,
  to: string,
  blocks: string[],
  opts: { typingDelayMs?: number; intraBlockDelayMs?: number } = {},
): Promise<EvoBlocksSendResult> {
  if (blocks.length === 0) {
    return { success: false, messageIds: [], error: "Mensagem vazia" };
  }
  const intra = opts.intraBlockDelayMs ?? 800;
  const messageIds: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const result = await evoSendText(config, instanceName, to, blocks[i], opts.typingDelayMs ?? 0);
    if (!result.success) {
      return {
        success: false,
        messageIds,
        error: `Bloco ${i + 1}/${blocks.length}: ${result.error ?? "erro desconhecido"}`,
        failedBlockIndex: i,
      };
    }
    if (result.messageId) messageIds.push(result.messageId);
    if (i < blocks.length - 1) await new Promise((r) => setTimeout(r, intra));
  }
  return { success: true, messageIds };
}
