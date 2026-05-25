import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  end: vi.fn(),
  pool: vi.fn(),
  query: vi.fn(),
}));

vi.mock("pg", () => ({
  default: {
    Pool: mocks.pool,
  },
}));

const originalEnv = { ...process.env };

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      DATABASE_URL: "postgres://cms0:cms0@localhost:5432/cms0",
    };
    mocks.query.mockReset();
    mocks.end.mockReset();
    mocks.pool.mockReset();
    mocks.pool.mockImplementation(() => ({
      end: mocks.end,
      query: mocks.query,
    }));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("returns ok when Postgres responds", async () => {
    mocks.query.mockResolvedValue({ rows: [{ "?column?": 1 }] });
    mocks.end.mockResolvedValue(undefined);

    const { GET } = await import("@/app/api/health/route");
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "cms0-admin",
    });
    expect(mocks.pool).toHaveBeenCalledWith({
      connectionString: "postgres://cms0:cms0@localhost:5432/cms0",
      max: 1,
    });
    expect(mocks.query).toHaveBeenCalledWith("select 1");
    expect(mocks.end).toHaveBeenCalled();
  });

  it("returns unavailable without leaking failure details", async () => {
    mocks.query.mockRejectedValue(new Error("connection refused"));
    mocks.end.mockResolvedValue(undefined);

    const { GET } = await import("@/app/api/health/route");
    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      service: "cms0-admin",
    });
    expect(mocks.end).toHaveBeenCalled();
  });
});
