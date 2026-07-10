import type { MusicTrack } from "@cw/contracts";

const NETEASE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  Referer: "https://music.163.com/"
};

export interface MineradioTrack extends MusicTrack {
  cover?: string;
  error?: string;
  url?: string;
  lyric?: string;
  source?: "netease";
}

interface NeteaseArtist {
  name?: string;
}

interface NeteaseAlbum {
  name?: string;
  picUrl?: string;
  coverUrl?: string;
}

interface NeteaseSong {
  id?: string | number;
  name?: string;
  ar?: NeteaseArtist[];
  artists?: NeteaseArtist[];
  al?: NeteaseAlbum;
  album?: NeteaseAlbum;
  dt?: number;
  duration?: number;
}

export async function searchNeteaseSongs(keywords: string, limit = 12): Promise<MineradioTrack[]> {
  const query = keywords.trim();
  if (!query) return [];

  const url = new URL("https://music.163.com/api/search/get/web");
  url.searchParams.set("csrf_token", "");
  url.searchParams.set("type", "1");
  url.searchParams.set("s", query);
  url.searchParams.set("offset", "0");
  url.searchParams.set("limit", String(Math.max(1, Math.min(limit, 30))));

  const body = await fetchJson<{ result?: { songs?: NeteaseSong[] } }>(url.toString(), 7000);
  return (body.result?.songs ?? []).map(mapNeteaseSong).filter((song): song is MineradioTrack => Boolean(song));
}

export async function fetchNeteaseSongsByIds(ids: string[]): Promise<MineradioTrack[]> {
  const songIds = ids.map((id) => id.trim()).filter(Boolean);
  const results = await Promise.all(songIds.map(fetchNeteaseSongById));
  return results.filter((song): song is MineradioTrack => Boolean(song));
}

async function fetchNeteaseSongById(songId: string): Promise<MineradioTrack | undefined> {
  try {
    const detail = await fetchJson<{ songs?: NeteaseSong[] }>(
      `https://music.163.com/api/song/detail/?id=${encodeURIComponent(songId)}&ids=[${encodeURIComponent(songId)}]`,
      7000
    );
    const mapped = detail.songs?.[0] ? mapNeteaseSong(detail.songs[0]) : undefined;
    if (!mapped) {
      return fallbackTrack(songId, "not_found");
    }
    return {
      ...mapped,
      lyric: await fetchNeteaseLyric(songId)
    };
  } catch (error) {
    return fallbackTrack(songId, error instanceof Error ? error.message : String(error));
  }
}

function mapNeteaseSong(song: NeteaseSong): MineradioTrack | undefined {
  if (!song.id) return undefined;
  const album = song.al ?? song.album ?? {};
  const artists = song.ar ?? song.artists ?? [];
  const artist = artists.map((item) => item.name).filter(Boolean).join(" / ") || "未知歌手";
  const durationMs = Number(song.dt ?? song.duration ?? 0);

  return {
    id: String(song.id),
    title: song.name || `网易云音乐 ${song.id}`,
    artist,
    album: album.name || "",
    cover: album.picUrl || album.coverUrl || "",
    url: `https://music.163.com/song/media/outer/url?id=${song.id}.mp3`,
    durationSeconds: durationMs > 1000 ? Math.round(durationMs / 1000) : durationMs,
    source: "netease"
  };
}

async function fetchNeteaseLyric(songId: string): Promise<string> {
  try {
    const lyric = await fetchJson<{ lrc?: { lyric?: string } }>(
      `https://music.163.com/api/song/lyric?id=${encodeURIComponent(songId)}&lv=-1&kv=-1&tv=-1`,
      7000
    );
    return lyric.lrc?.lyric || "";
  } catch {
    return "";
  }
}

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: NETEASE_HEADERS,
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackTrack(songId: string, error: string): MineradioTrack {
  return {
    id: songId,
    title: `网易云音乐 ${songId}`,
    artist: "网易云音乐",
    album: "",
    cover: "",
    url: `https://music.163.com/song/media/outer/url?id=${songId}.mp3`,
    durationSeconds: 0,
    source: "netease",
    lyric: "",
    error
  };
}
