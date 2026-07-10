import { Readable } from "node:stream";

const NETEASE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  Referer: "https://music.163.com/",
};

const FORWARDED_HEADERS = [
  "accept-ranges",
  "cache-control",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified",
];

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (!["GET", "HEAD"].includes(req.method ?? "GET")) {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const target = resolveStreamUrl(req.query);
  if (!target) {
    res.status(400).json({ error: "Missing or invalid music track" });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(target, {
      method: req.method,
      headers: buildRequestHeaders(req),
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok && response.status !== 206) {
      res.status(response.status).json({
        error: "Music stream request failed",
        detail: await safeReadText(response),
      });
      return;
    }

    res.status(response.status);

    for (const headerName of FORWARDED_HEADERS) {
      const headerValue = response.headers.get(headerName);
      if (headerValue) {
        res.setHeader(headerName, headerValue);
      }
    }

    if (!res.getHeader("content-type")) {
      res.setHeader("content-type", "audio/mpeg");
    }
    if (!res.getHeader("accept-ranges")) {
      res.setHeader("accept-ranges", "bytes");
    }

    if (req.method === "HEAD" || !response.body) {
      res.end();
      return;
    }

    Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    res.status(502).json({
      error: "Music stream proxy failed",
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timeout);
  }
}

function resolveStreamUrl(query) {
  const trackId = firstQueryValue(query.trackId);
  if (/^\d+$/.test(trackId)) {
    return `https://music.163.com/song/media/outer/url?id=${trackId}.mp3`;
  }

  const urlValue = firstQueryValue(query.url);
  if (!urlValue) return undefined;

  try {
    const url = new URL(urlValue);
    if (url.protocol !== "https:") return undefined;
    if (!isAllowedMusicHost(url.hostname)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function firstQueryValue(value) {
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

function isAllowedMusicHost(hostname) {
  return hostname === "music.163.com" || hostname.endsWith(".music.126.net");
}

function buildRequestHeaders(req) {
  const headers = { ...NETEASE_HEADERS };
  if (typeof req.headers.range === "string" && req.headers.range.length > 0) {
    headers.Range = req.headers.range;
  }
  return headers;
}

async function safeReadText(response) {
  try {
    const text = await response.text();
    return text || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}
