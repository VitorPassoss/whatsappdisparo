import type { Express, Request, Response } from "express";
import { getSetting } from "./settings";

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

// ─── Credentials ──────────────────────────────────────────────────────────────

/**
 * Retorna as credenciais do Facebook App lendo do banco (settings) com
 * fallback pra process.env. Mantém compat enquanto o Vitor migra do .env
 * pro painel admin.
 */
async function getFacebookCreds(): Promise<{ appId: string; appSecret: string }> {
  const [appId, appSecret] = await Promise.all([
    getSetting("FACEBOOK_APP_ID"),
    getSetting("FACEBOOK_APP_SECRET"),
  ]);
  return { appId: appId ?? "", appSecret: appSecret ?? "" };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function exchangeCodeForToken(code: string, redirectUri: string): Promise<{
  access_token?: string;
  error?: { message: string };
}> {
  const { appId, appSecret } = await getFacebookCreds();
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
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
  const { appId, appSecret } = await getFacebookCreds();
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
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

/**
 * Resolve o origin público do app. Prioriza:
 *  1. setting APP_ORIGIN configurado via UI admin
 *  2. origin enviado pelo client (sanitizado contra a setting)
 *  3. construído a partir do header Host da request
 */
async function resolveOrigin(req: Request, clientOrigin?: string): Promise<string> {
  const configured = (await getSetting("APP_ORIGIN")) ?? "";
  if (configured) {
    // Quando admin definiu APP_ORIGIN, ele manda — só aceita clientOrigin
    // se bater (defesa contra open-redirect).
    if (clientOrigin && clientOrigin === configured) return configured;
    return configured;
  }

  // Sem APP_ORIGIN configurado: deriva do Host atual.
  const host = req.get("host");
  const proto = req.get("x-forwarded-proto") ?? req.protocol ?? "https";
  if (host) return `${proto}://${host}`;
  return clientOrigin ?? "http://localhost:3000";
}

export function registerFacebookOAuthRoutes(app: Express) {
  // 1. Generate Facebook OAuth URL
  app.get("/api/auth/facebook/url", async (req: Request, res: Response) => {
    const { appId } = await getFacebookCreds();
    if (!appId) {
      res.status(500).json({ error: "Facebook App ID não configurado. Acesse /admin/settings." });
      return;
    }

    const origin = await resolveOrigin(req, req.query.origin as string | undefined);
    const redirectUri = `${origin}/auth/facebook/callback`;
    const scope = [
      "whatsapp_business_management",
      "whatsapp_business_messaging",
      "business_management",
    ].join(",");

    const params = new URLSearchParams({
      client_id: appId,
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
    const { code, origin: clientOrigin } = req.body as { code?: string; origin?: string };

    if (!code) {
      res.status(400).json({ error: "Código de autorização ausente" });
      return;
    }

    const { appId, appSecret } = await getFacebookCreds();
    if (!appId || !appSecret) {
      res.status(500).json({ error: "Credenciais do Facebook não configuradas. Acesse /admin/settings." });
      return;
    }

    const origin = await resolveOrigin(req, clientOrigin);
    const redirectUri = `${origin}/auth/facebook/callback`;

    try {
      // Exchange code for short-lived token
      const tokenData = await exchangeCodeForToken(code, redirectUri);
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
