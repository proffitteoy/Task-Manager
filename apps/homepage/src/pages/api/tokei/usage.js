const CORE_URL = process.env.WORKBENCH_CORE_URL || "http://127.0.0.1:3900";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const fresh = req.query.fresh ? "?fresh=1" : "";
  try {
    const response = await fetch(`${CORE_URL}/api/tokei/usage${fresh}`);
    const payload = await response.json();

    if (!response.ok) {
      res.status(response.status).json(payload);
      return;
    }

    if (payload?.raw) {
      res.status(200).json(payload.raw);
      return;
    }

    if (payload?.connected === false) {
      res.status(502).json({
        error: "Tokei collector failed",
        detail: payload.error || "Tokei collector unavailable",
      });
      return;
    }

    res.status(200).json(payload);
  } catch (error) {
    res.status(502).json({
      error: "Tokei proxy failed",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
