import { beforeEach, describe, expect, it, vi } from "vitest";

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
  beforeEach(() => vi.clearAllMocks());

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
