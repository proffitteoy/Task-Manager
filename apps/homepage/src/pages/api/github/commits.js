const CORE_URL = process.env.WORKBENCH_CORE_URL || "http://127.0.0.1:3900";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const fresh = req.query.fresh ? "?fresh=1" : "";
  try {
    const response = await fetch(`${CORE_URL}/api/github/contributions${fresh}`);
    const payload = await response.json();

    if (!response.ok) {
      res.status(response.status).json(payload);
      return;
    }

    res.status(200).json({
      fetchedAt: payload.fetchedAt ?? Date.now(),
      since: payload.since,
      username: payload.username,
      source: payload.source,
      roots: payload.roots ?? [],
      repos: payload.repos ?? [],
      days: payload.days ?? [],
      total: payload.total ?? 0,
      activeDays: payload.activeDays ?? 0,
      peak: payload.peak ?? { date: "", count: 0 },
      currentStreak: payload.currentStreak ?? 0,
      longestStreak: payload.longestStreak ?? 0,
      errors: payload.errors ?? [],
    });
  } catch (error) {
    res.status(502).json({
      error: "GitHub proxy failed",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
