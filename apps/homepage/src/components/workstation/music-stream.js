export function buildMusicStreamUrl(track) {
  if (!track) return "";

  const trackId = String(track.id ?? "").trim();
  const url = typeof track.url === "string" ? track.url.trim() : "";
  const hasTrackId = /^\d+$/.test(trackId);

  if (!hasTrackId && !url) return "";

  const query = new URLSearchParams();
  if (hasTrackId) query.set("trackId", trackId);
  if (url) query.set("url", url);

  return `/api/workstation/music/stream?${query.toString()}`;
}
