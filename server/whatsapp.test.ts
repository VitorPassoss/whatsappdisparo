import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { COOKIE_NAME } from "../shared/const";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(overrides?: Partial<AuthenticatedUser>): { ctx: TrpcContext; clearedCookies: { name: string; options: Record<string, unknown> }[] } {
  const clearedCookies: { name: string; options: Record<string, unknown> }[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-openid",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "lax",
      httpOnly: true,
      path: "/",
    });
  });

  it("returns current user from auth.me when authenticated", async () => {
    const { ctx } = createAuthContext({ name: "João Silva", email: "joao@test.com" });
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user?.name).toBe("João Silva");
    expect(user?.email).toBe("joao@test.com");
  });

  it("returns null from auth.me when not authenticated", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user).toBeNull();
  });
});

// ─── Sessions ─────────────────────────────────────────────────────────────────

describe("sessions router", () => {
  it("requires authentication to list sessions", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.sessions.list()).rejects.toThrow();
  });

  it("requires authentication to create session", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.sessions.create({
        name: "Test",
        accessToken: "token123456789",
        phoneNumberId: "123456789",
      })
    ).rejects.toThrow();
  });
});

// ─── Contact Lists ─────────────────────────────────────────────────────────────

describe("contactLists router", () => {
  it("requires authentication to list contact lists", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.contactLists.list()).rejects.toThrow();
  });

  it("requires authentication to create contact list", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.contactLists.create({ name: "My List" })).rejects.toThrow();
  });
});

// ─── Campaigns ────────────────────────────────────────────────────────────────

describe("campaigns router", () => {
  it("requires authentication to list campaigns", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.campaigns.list({})).rejects.toThrow();
  });

  it("requires authentication to send campaign", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.campaigns.send({
        sessionId: 1,
        name: "Test Campaign",
        message: "Hello",
        rawPhones: "5511999999999",
      })
    ).rejects.toThrow();
  });

  it("requires authentication to cancel campaign", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.campaigns.cancel({ id: 1 })).rejects.toThrow();
  });

  it("rejects unauthenticated send with scheduledAt", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const futureDate = new Date(Date.now() + 3_600_000);
    await expect(
      caller.campaigns.send({
        sessionId: 1,
        name: "Scheduled Campaign",
        message: "Hello",
        rawPhones: "5511999999999",
        scheduledAt: futureDate,
      })
    ).rejects.toThrow();
  });
});

// ─── Dashboard ────────────────────────────────────────────────────────────────

describe("dashboard router", () => {
  it("requires authentication to get stats", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.dashboard.stats()).rejects.toThrow();
  });
});
