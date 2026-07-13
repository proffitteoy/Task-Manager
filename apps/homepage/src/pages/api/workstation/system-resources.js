import si from "systeminformation";

export default async function handler(_req, res) {
  const [loadResult, memoryResult, graphicsResult] = await Promise.allSettled([
    si.currentLoad(),
    si.mem(),
    si.graphics(),
  ]);

  const load = loadResult.status === "fulfilled" ? loadResult.value : null;
  const memory = memoryResult.status === "fulfilled" ? memoryResult.value : null;
  const controllers = graphicsResult.status === "fulfilled" && Array.isArray(graphicsResult.value?.controllers)
    ? graphicsResult.value.controllers
    : [];
  const gpu = controllers
    .filter((controller) => controller && controller.model)
    .sort((left, right) => Number(right.memoryTotal ?? 0) - Number(left.memoryTotal ?? 0))[0];

  return res.status(200).json({
    fetchedAt: Date.now(),
    cpu: load
      ? {
          usagePercent: finiteNumber(load.currentLoad),
          userPercent: finiteNumber(load.currentLoadUser),
          systemPercent: finiteNumber(load.currentLoadSystem),
        }
      : null,
    memory: memory
      ? {
          usagePercent: memory.total > 0 ? (memory.active / memory.total) * 100 : null,
          usedBytes: finiteNumber(memory.active),
          totalBytes: finiteNumber(memory.total),
        }
      : null,
    gpu: gpu
      ? {
          model: String(gpu.model),
          usagePercent: finiteNumber(gpu.utilizationGpu),
          memoryUsedMb: finiteNumber(gpu.memoryUsed),
          memoryTotalMb: finiteNumber(gpu.memoryTotal),
          temperatureC: finiteNumber(gpu.temperatureGpu),
        }
      : null,
    errors: [
      loadResult.status === "rejected" ? "CPU 指标不可用" : null,
      memoryResult.status === "rejected" ? "内存指标不可用" : null,
      graphicsResult.status === "rejected" ? "GPU 指标不可用" : null,
    ].filter(Boolean),
  });
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
