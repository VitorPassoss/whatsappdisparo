import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(overrides?: Partial<AuthenticatedUser>): TrpcContext {
  const user: AuthenticatedUser = {
    id: 999,
    openId: "automation-test-user",
    email: "automation@test.com",
    name: "Automation Test User",
    loginMethod: "email",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Automations Router ───────────────────────────────────────────────────────

describe("automations.list", () => {
  it("returns an array (empty or populated) for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.automations.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("throws UNAUTHORIZED for unauthenticated user", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);

    await expect(caller.automations.list()).rejects.toThrow();
  });
});

describe("automations.create", () => {
  it("throws NOT_FOUND when sessionId does not belong to user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.automations.create({
        sessionId: 99999, // non-existent session
        name: "Test Funil",
        trigger: "oi",
        triggerType: "contains",
        steps: [{ message: "Olá! Como posso ajudar?", delaySeconds: 0 }],
      })
    ).rejects.toThrow();
  });

  it("validates input: requires at least one step", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.automations.create({
        sessionId: 1,
        name: "Test",
        trigger: "oi",
        triggerType: "contains",
        steps: [], // empty steps should fail validation
      })
    ).rejects.toThrow();
  });

  it("validates input: trigger cannot be empty", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.automations.create({
        sessionId: 1,
        name: "Test",
        trigger: "", // empty trigger
        triggerType: "contains",
        steps: [{ message: "Olá!", delaySeconds: 0 }],
      })
    ).rejects.toThrow();
  });
});

describe("automations.update", () => {
  it("throws NOT_FOUND when automation does not belong to user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.automations.update({
        id: 99999, // non-existent automation
        name: "Updated Name",
      })
    ).rejects.toThrow();
  });
});

describe("automations.delete", () => {
  it("throws NOT_FOUND when automation does not belong to user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.automations.delete({ id: 99999 })
    ).rejects.toThrow();
  });
});

describe("automations.toggleActive", () => {
  it("throws NOT_FOUND when automation does not belong to user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.automations.toggleActive({ id: 99999, isActive: "1" })
    ).rejects.toThrow();
  });

  it("validates isActive enum: only '0' or '1' are valid", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.automations.toggleActive({
        id: 1,
        isActive: "2" as "0" | "1", // invalid value
      })
    ).rejects.toThrow();
  });
});

describe("automations trigger type validation", () => {
  it("accepts 'contains' trigger type", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    // Should fail at NOT_FOUND for session, not at validation
    await expect(
      caller.automations.create({
        sessionId: 99999,
        name: "Test",
        trigger: "oi",
        triggerType: "contains",
        steps: [{ message: "Olá!", delaySeconds: 0 }],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("accepts 'exact' trigger type", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.automations.create({
        sessionId: 99999,
        name: "Test",
        trigger: "oi",
        triggerType: "exact",
        steps: [{ message: "Olá!", delaySeconds: 0 }],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("accepts 'starts_with' trigger type", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.automations.create({
        sessionId: 99999,
        name: "Test",
        trigger: "oi",
        triggerType: "starts_with",
        steps: [{ message: "Olá!", delaySeconds: 0 }],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects invalid trigger type", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.automations.create({
        sessionId: 99999,
        name: "Test",
        trigger: "oi",
        triggerType: "invalid" as "contains",
        steps: [{ message: "Olá!", delaySeconds: 0 }],
      })
    ).rejects.toThrow();
  });
});
