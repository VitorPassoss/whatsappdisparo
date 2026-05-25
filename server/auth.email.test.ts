import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────

const mockGetUserByEmail = vi.fn();
const mockUpsertUser = vi.fn();
const mockUpdateUserPasswordHash = vi.fn();

vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    getUserByEmail: mockGetUserByEmail,
    upsertUser: mockUpsertUser,
    updateUserPasswordHash: mockUpdateUserPasswordHash,
  };
});

// ─── Mock SDK ─────────────────────────────────────────────────────────────────

vi.mock("./_core/sdk", () => ({
  sdk: {
    createSessionToken: vi.fn().mockResolvedValue("mock-jwt-token"),
    authenticateRequest: vi.fn().mockRejectedValue(new Error("no session")),
  },
}));

// ─── Mock bcrypt ──────────────────────────────────────────────────────────────

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed-password"),
    compare: vi.fn(),
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(): TrpcContext {
  return {
    req: {
      protocol: "https",
      headers: { "x-forwarded-proto": "https" },
    } as any,
    res: {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    } as any,
    user: null,
  };
}

async function getAppRouter() {
  const { appRouter } = await import("./routers");
  return appRouter;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("auth.register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create a new user and set session cookie", async () => {
    mockGetUserByEmail
      .mockResolvedValueOnce(undefined) // first call: check if exists → not found
      .mockResolvedValueOnce({ id: 1, openId: "email:test@example.com", email: "test@example.com", name: "Test User", passwordHash: null, role: "user", loginMethod: "email", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }); // second call: get user after upsert

    mockUpsertUser.mockResolvedValue(undefined);
    mockUpdateUserPasswordHash.mockResolvedValue(undefined);

    const ctx = makeCtx();
    const appRouter = await getAppRouter();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.register({
      name: "Test User",
      email: "test@example.com",
      password: "password123",
    });

    expect(result).toEqual({ success: true });
    expect(mockGetUserByEmail).toHaveBeenCalledWith("test@example.com");
    expect(mockUpsertUser).toHaveBeenCalledWith(expect.objectContaining({
      openId: "email:test@example.com",
      email: "test@example.com",
      loginMethod: "email",
    }));
    expect(mockUpdateUserPasswordHash).toHaveBeenCalledWith(1, "hashed-password");
    expect((ctx.res as any).cookie).toHaveBeenCalledWith(
      "app_session_id",
      "mock-jwt-token",
      expect.objectContaining({ httpOnly: true })
    );
  });

  it("should throw CONFLICT if email already exists", async () => {
    mockGetUserByEmail.mockResolvedValueOnce({
      id: 1,
      openId: "email:existing@example.com",
      email: "existing@example.com",
      passwordHash: "hash",
      name: "Existing",
      role: "user",
      loginMethod: "email",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    });

    const ctx = makeCtx();
    const appRouter = await getAppRouter();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.register({
        name: "Test",
        email: "existing@example.com",
        password: "password123",
      })
    ).rejects.toThrow("E-mail já cadastrado");
  });
});

describe("auth.login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should login with correct credentials and set session cookie", async () => {
    const bcrypt = await import("bcryptjs");
    (bcrypt.default.compare as any).mockResolvedValue(true);

    mockGetUserByEmail.mockResolvedValueOnce({
      id: 1,
      openId: "email:user@example.com",
      email: "user@example.com",
      passwordHash: "hashed-password",
      name: "User",
      role: "user",
      loginMethod: "email",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    });
    mockUpsertUser.mockResolvedValue(undefined);

    const ctx = makeCtx();
    const appRouter = await getAppRouter();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.login({
      email: "user@example.com",
      password: "password123",
    });

    expect(result).toEqual({ success: true });
    expect((ctx.res as any).cookie).toHaveBeenCalledWith(
      "app_session_id",
      "mock-jwt-token",
      expect.objectContaining({ httpOnly: true })
    );
  });

  it("should throw UNAUTHORIZED for wrong password", async () => {
    const bcrypt = await import("bcryptjs");
    (bcrypt.default.compare as any).mockResolvedValue(false);

    mockGetUserByEmail.mockResolvedValueOnce({
      id: 1,
      openId: "email:user@example.com",
      email: "user@example.com",
      passwordHash: "hashed-password",
      name: "User",
      role: "user",
      loginMethod: "email",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    });

    const ctx = makeCtx();
    const appRouter = await getAppRouter();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.login({ email: "user@example.com", password: "wrongpassword" })
    ).rejects.toThrow("E-mail ou senha incorretos");
  });

  it("should throw UNAUTHORIZED for non-existent email", async () => {
    mockGetUserByEmail.mockResolvedValueOnce(undefined);

    const ctx = makeCtx();
    const appRouter = await getAppRouter();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.login({ email: "notfound@example.com", password: "password123" })
    ).rejects.toThrow("E-mail ou senha incorretos");
  });
});
