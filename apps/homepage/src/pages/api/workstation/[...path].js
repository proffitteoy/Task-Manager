const CORE_URL = process.env.WORKBENCH_CORE_URL || "http://127.0.0.1:3900";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  const path = Array.isArray(req.query.path) ? req.query.path.join("/") : "";
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === "path") continue;
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else if (value !== undefined) {
      query.append(key, value);
    }
  }

  const target = `${CORE_URL}/api/${path}${query.size ? `?${query.toString()}` : ""}`;
  const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readRequestBody(req);

  try {
    const response = await fetch(target, {
      method: req.method,
      headers: {
        "content-type": req.headers["content-type"] || "application/json",
      },
      body,
    });
    const text = await response.text();
    res.status(response.status);
    res.setHeader("content-type", response.headers.get("content-type") || "application/json");
    res.send(text);
  } catch (error) {
    res.status(502).json({
      error: "Workbench core proxy failed",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
