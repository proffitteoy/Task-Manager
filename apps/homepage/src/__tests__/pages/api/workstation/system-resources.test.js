import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import createMockRes from "test-utils/create-mock-res";

const { si } = vi.hoisted(() => ({
  si: {
    currentLoad: vi.fn(),
    mem: vi.fn(),
    graphics: vi.fn(),
  },
}));

vi.mock("systeminformation", () => ({ default: si }));

import handler from "pages/api/workstation/system-resources";

describe("workstation system resources", () => {
  let now = Date.UTC(2026, 0, 1);

  beforeEach(() => {
    vi.useFakeTimers();
    now += 60_000;
    vi.setSystemTime(now);
    vi.clearAllMocks();
  });

  afterAll(() => vi.useRealTimers());

  it("returns CPU, memory and the primary GPU", async () => {
    si.currentLoad.mockResolvedValue({ currentLoad: 12, currentLoadUser: 8, currentLoadSystem: 4 });
    si.mem.mockResolvedValue({ active: 60, total: 100 });
    si.graphics.mockResolvedValue({
      controllers: [
        { model: "Integrated", memoryTotal: 512, utilizationGpu: 4 },
        { model: "Discrete", memoryTotal: 8192, memoryUsed: 2048, utilizationGpu: 75, temperatureGpu: 62 },
      ],
    });

    const res = createMockRes();
    await handler({}, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.cpu.usagePercent).toBe(12);
    expect(res.body.memory.usagePercent).toBe(60);
    expect(res.body.gpu.model).toBe("Discrete");
    expect(res.body.gpu.usagePercent).toBe(75);
  });

  it("reuses a recent sample and coalesces concurrent probes", async () => {
    si.currentLoad.mockResolvedValue({ currentLoad: 12 });
    si.mem.mockResolvedValue({ active: 60, total: 100 });
    si.graphics.mockResolvedValue({ controllers: [] });

    const first = createMockRes();
    const second = createMockRes();
    await Promise.all([handler({}, first), handler({}, second)]);

    expect(si.currentLoad).toHaveBeenCalledTimes(1);
    expect(si.mem).toHaveBeenCalledTimes(1);
    expect(si.graphics).toHaveBeenCalledTimes(1);
    expect(second.body.fetchedAt).toBe(first.body.fetchedAt);

    vi.advanceTimersByTime(10_001);
    const expired = createMockRes();
    await handler({}, expired);

    expect(si.currentLoad).toHaveBeenCalledTimes(2);
    expect(si.mem).toHaveBeenCalledTimes(2);
    expect(si.graphics).toHaveBeenCalledTimes(2);
    expect(expired.body.fetchedAt).toBeGreaterThan(first.body.fetchedAt);
  });

  it("degrades explicitly when GPU metrics are unavailable", async () => {
    si.currentLoad.mockResolvedValue({ currentLoad: 1 });
    si.mem.mockResolvedValue({ active: 1, total: 2 });
    si.graphics.mockRejectedValue(new Error("unsupported"));

    const res = createMockRes();
    await handler({}, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.gpu).toBeNull();
    expect(res.body.errors).toContain("GPU 指标不可用");
  });
});
