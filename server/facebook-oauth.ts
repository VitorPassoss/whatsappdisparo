import type { Express, Request, Response } from "express";
import { ENV } from "./_core/env";

// ─── Types ────────────────────────────────────────────────────────────────────

type PhoneNumber = {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating: string;
};

type Waba = {
  id: string;
  name: string;
  phone_numbers?: PhoneNumber[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function exchangeCodeForToken(code: string, origin: string): Promise<{
  access_token?: string;
  error?: { message: string };
}> {
  const redirectUri = `${origin}/auth/facebook/callback`;
  const params = new URLSearchParams({
    client_id: ENV.facebookAppId,
    client_secret: ENV.facebookAppSecret,
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?${params.toString()}`
  );
  return res.json() as Promise<{ access_token?: string; error?: { message: string } }>;
}

async function getLongLivedToken(shortToken: string): Promise<{
  access_token?: string;
  error?: { message: string };
}> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: ENV.facebookAppId,
    client_secret: ENV.facebookAppSecret,
    fb_exchange_token: shortToken,
  });

  const res = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?${params.toString()}`
  );
  return res.json() as Promise<{ access_token?: string; error?: { message: string } }>;
}

async function getWabaAccounts(accessToken: string): Promise<{
  data?: Waba[];
  error?: { message: string };
}> {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/me/whatsapp_business_accounts?fields=id,name&access_token=${accessToken}`
  );
  return res.json() as Promise<{ data?: Waba[]; error?: { message: string } }>;
}

async function getPhoneNumbers(wabaId: string, accessToken: string): Promise<{
  data?: PhoneNumber[];
  error?: { message: string };
}> {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating&access_token=${accessToken}`
  );
  return res.json() as Promise<{ data?: PhoneNumber[]; error?: { message: string } }>;
}

// ─── Route registration ───────────────────────────────────────────────────────

// Allowed origins for Facebook OAuth redirect_uri
const ALLOWED_ORIGINS = [
  "https://whatsappdash-j5kkyxvt.manus.space",
  "https://www.paineldisparosapi.online",
  "https://paineldisparosapi.online",
  "http://localhost:3000",
];

function sanitizeOrigin(origin: string | undefined): string {
  const defaultOrigin = "https://whatsappdash-j5kkyxvt.manus.space";
  if (!origin) return defaultOrigin;
  // Allow any *.manus.space or *.manus.computer subdomain (dev/preview URLs)
  const isManusUrl = /^https:\/\/[a-z0-9-]+\.(manus\.space|manus\.computer)$/.test(origin);
  if (ALLOWED_ORIGINS.includes(origin) || isManusUrl) return origin;
  return defaultOrigin;
}

export function registerFacebookOAuthRoutes(app: Express) {
  // 1. Generate Facebook OAuth URL
  app.get("/api/auth/facebook/url", (req: Request, res: Response) => {
    if (!ENV.facebookAppId) {
      res.status(500).json({ error: "Facebook App ID não configurado" });
      return;
    }

    // Use origin from query param (sent by frontend) so it works with any domain
    const origin = sanitizeOrigin(req.query.origin as string);
    const redirectUri = `${origin}/auth/facebook/callback`;
    const scope = [
      "whatsapp_business_management",
      "whatsapp_business_messaging",
      "business_management",
    ].join(",");

    const params = new URLSearchParams({
      client_id: ENV.facebookAppId,
      redirect_uri: redirectUri,
      scope,
      response_type: "code",
      state: "fbauth_" + Date.now(),
    });

    const url = `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
    res.json({ url, redirectUri });
  });

  // 2. Exchange code for token and list WABAs + phone numbers
  app.post("/api/auth/facebook/exchange", async (req: Request, res: Response) => {
    const { code } = req.body as { code?: string };

    if (!code) {
      res.status(400).json({ error: "Código de autorização ausente" });
      return;
    }

    const origin = sanitizeOrigin((req.body as { code?: string; origin?: string }).origin);

    try {
      // Exchange code for short-lived token
      const tokenData = await exchangeCodeForToken(code, origin);
      if (!tokenData.access_token) {
        res.status(400).json({ error: tokenData.error?.message ?? "Falha ao trocar código por token" });
        return;
      }

      // Get long-lived token (60 days)
      const longTokenData = await getLongLivedToken(tokenData.access_token);
      const accessToken = longTokenData.access_token ?? tokenData.access_token;

      // Get WABAs
      const wabasData = await getWabaAccounts(accessToken);
      if (!wabasData.data || wabasData.data.length === 0) {
        res.status(400).json({ error: "Nenhuma conta WhatsApp Business encontrada para este perfil" });
        return;
      }

      // Get phone numbers for each WABA
      const wabasWithPhones: (Waba & { phone_numbers: PhoneNumber[] })[] = [];
      for (const waba of wabasData.data) {
        const phonesData = await getPhoneNumbers(waba.id, accessToken);
        wabasWithPhones.push({
          ...waba,
          phone_numbers: phonesData.data ?? [],
        });
      }

      res.json({
        accessToken,
        wabas: wabasWithPhones,
      });
    } catch (err: unknown) {
      console.error("[Facebook OAuth] Exchange failed:", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Erro interno ao processar autenticação",
      });
    }
  });
}
