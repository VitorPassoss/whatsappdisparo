import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for Facebook OAuth routes.
 * Mocks the `./settings` module (which now owns Facebook credentials and
 * the public APP_ORIGIN) and the fetch calls to the Graph API.
 */

// Mock settings — credenciais agora vêm do banco via getSetting()
vi.mock("./settings", () => ({
  getSetting: vi.fn(async (key: string) => {
    if (key === "FACEBOOK_APP_ID") return "test_app_id_123";
    if (key === "FACEBOOK_APP_SECRET") return "test_app_secret_456";
    if (key === "APP_ORIGIN") return "https://painelapi.online";
    return null;
  }),
}));

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Import after mocking
const { registerFacebookOAuthRoutes } = await import("./facebook-oauth");

// Minimal Express mock
function createMockReq(overrides: Record<string, unknown> = {}) {
  const headers: Record<string, string> = {
    host: "painelapi.online",
    "x-forwarded-proto": "https",
    ...((overrides.headers as Record<string, string>) ?? {}),
  };
  return {
    query: {},
    body: {},
    protocol: "https",
    get(name: string) {
      return headers[name.toLowerCase()];
    },
    ...overrides,
  };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      return res;
    },
  };
  return res;
}

// Minimal Express app mock
function createMockApp() {
  const routes: Record<string, (req: ReturnType<typeof createMockReq>, res: ReturnType<typeof createMockRes>) => Promise<void> | void> = {};
  return {
    get(path: string, handler: (req: ReturnType<typeof createMockReq>, res: ReturnType<typeof createMockRes>) => Promise<void> | void) {
      routes[`GET:${path}`] = handler;
    },
    post(path: string, handler: (req: ReturnType<typeof createMockReq>, res: ReturnType<typeof createMockRes>) => Promise<void> | void) {
      routes[`POST:${path}`] = handler;
    },
    routes,
  };
}

describe("Facebook OAuth Routes", () => {
  let app: ReturnType<typeof createMockApp>;

  beforeEach(() => {
    app = createMockApp();
    registerFacebookOAuthRoutes(app as never);
    mockFetch.mockReset();
  });

  describe("GET /api/auth/facebook/url", () => {
    it("returns a valid Facebook OAuth URL with correct App ID", async () => {
      const req = createMockReq();
      const res = createMockRes();

      await app.routes["GET:/api/auth/facebook/url"](req, res);

      expect(res.statusCode).toBe(200);
      const body = res.body as { url: string };
      expect(body.url).toContain("https://www.facebook.com/v19.0/dialog/oauth");
      expect(body.url).toContain("client_id=test_app_id_123");
      expect(body.url).toContain("whatsapp_business_management");
      expect(body.url).toContain("whatsapp_business_messaging");
      expect(body.url).toContain("business_management");
    });

    it("includes redirect_uri derived from configured APP_ORIGIN", async () => {
      const req = createMockReq();
      const res = createMockRes();

      await app.routes["GET:/api/auth/facebook/url"](req, res);

      const body = res.body as { url: string; redirectUri: string };
      expect(body.redirectUri).toBe("https://painelapi.online/auth/facebook/callback");
      expect(body.url).toContain(encodeURIComponent("https://painelapi.online/auth/facebook/callback"));
    });
  });

  describe("POST /api/auth/facebook/exchange", () => {
    it("returns 400 when code is missing", async () => {
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      await app.routes["POST:/api/auth/facebook/exchange"](req, res);

      expect(res.statusCode).toBe(400);
      const body = res.body as { error: string };
      expect(body.error).toContain("Código de autorização ausente");
    });

    it("returns 400 when Facebook token exchange fails", async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ error: { message: "Invalid OAuth code" } }),
      });

      const req = createMockReq({ body: { code: "invalid_code_123" } });
      const res = createMockRes();

      await app.routes["POST:/api/auth/facebook/exchange"](req, res);

      expect(res.statusCode).toBe(400);
      const body = res.body as { error: string };
      expect(body.error).toContain("Invalid OAuth code");
    });

    it("returns 400 when no WhatsApp Business accounts found", async () => {
      mockFetch
        .mockResolvedValueOnce({
          json: async () => ({ access_token: "short_token_abc" }),
        })
        .mockResolvedValueOnce({
          json: async () => ({ access_token: "long_token_xyz" }),
        })
        .mockResolvedValueOnce({
          json: async () => ({ data: [] }),
        });

      const req = createMockReq({ body: { code: "valid_code_123" } });
      const res = createMockRes();

      await app.routes["POST:/api/auth/facebook/exchange"](req, res);

      expect(res.statusCode).toBe(400);
      const body = res.body as { error: string };
      expect(body.error).toContain("Nenhuma conta WhatsApp Business encontrada");
    });

    it("returns wabas with phone numbers on success", async () => {
      mockFetch
        .mockResolvedValueOnce({
          json: async () => ({ access_token: "short_token" }),
        })
        .mockResolvedValueOnce({
          json: async () => ({ access_token: "long_token_abc123" }),
        })
        .mockResolvedValueOnce({
          json: async () => ({
            data: [{ id: "waba_001", name: "Minha Empresa" }],
          }),
        })
        .mockResolvedValueOnce({
          json: async () => ({
            data: [
              {
                id: "phone_001",
                display_phone_number: "+55 11 99999-9999",
                verified_name: "Empresa Teste",
                quality_rating: "GREEN",
              },
            ],
          }),
        });

      const req = createMockReq({ body: { code: "valid_code_abc" } });
      const res = createMockRes();

      await app.routes["POST:/api/auth/facebook/exchange"](req, res);

      expect(res.statusCode).toBe(200);
      const body = res.body as { accessToken: string; wabas: Array<{ id: string; name: string; phone_numbers: unknown[] }> };
      expect(body.accessToken).toBe("long_token_abc123");
      expect(body.wabas).toHaveLength(1);
      expect(body.wabas[0].name).toBe("Minha Empresa");
      expect(body.wabas[0].phone_numbers).toHaveLength(1);
    });
  });
});
