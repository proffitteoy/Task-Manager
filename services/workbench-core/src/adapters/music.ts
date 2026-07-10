import type { MusicState, MusicTrack } from "@cw/contracts";

import type { WorkbenchConfig } from "../config.js";
import type { WorkbenchRepository } from "../modules/repository.js";
import { fetchNeteaseSongsByIds, searchNeteaseSongs } from "./mineradio.js";

type MusicOptions = {
  enabled?: boolean;
  provider?: string;
  serviceUrl?: string;
  playlistTrackIds?: string[];
};

export class MusicAdapter {
  constructor(
    private readonly config: WorkbenchConfig,
    private readonly repository: WorkbenchRepository
  ) {}

  async current(options: MusicOptions = {}): Promise<
    MusicState & { connected: boolean; provider: string; serviceUrl?: string; error?: string; degraded?: boolean }
  > {
    const localState = this.repository.getMusicState();
    if (options.enabled === false) {
      return { ...localState, connected: false, provider: "disabled", error: "音乐模块已在工作站设置中禁用" };
    }
    const serviceUrl = options.serviceUrl || this.config.musicServiceUrl;
    if (serviceUrl && options.provider !== "mock") {
      try {
        const response = await fetch(`${serviceUrl}/api/music/current`);
        if (response.ok) {
          const remote = (await response.json()) as MusicState;
          return { ...remote, connected: true, provider: "remote", serviceUrl };
        }
        return {
          ...localState,
          connected: false,
          provider: options.provider ?? "remote",
          serviceUrl,
          error: `音乐服务返回 ${response.status}`
        };
      } catch {
        return {
          ...localState,
          connected: false,
          provider: options.provider ?? "remote",
          serviceUrl,
          error: "无法连接音乐服务；当前只保留工作站内的播放状态"
        };
      }
    }
    if (options.provider === "mineradio") {
      return {
        ...localState,
        connected: true,
        provider: "mineradio",
        degraded: false
      };
    }
    return { ...localState, connected: true, provider: "mock", degraded: false };
  }

  async play(track?: MusicTrack, options: MusicOptions = {}): Promise<MusicState> {
    const current = this.repository.getMusicState();
    const configuredPlaylist = await this.resolveConfiguredPlaylist(options);
    const currentTrackInPlaylist = current.current
      ? configuredPlaylist.find((item) => item.id === current.current?.id)
      : undefined;
    const nextTrack = track ?? currentTrackInPlaylist ?? configuredPlaylist[0] ?? defaultTrack();
    const queue = configuredPlaylist.length > 0 ? buildQueue(configuredPlaylist, nextTrack.id) : current.queue;
    return this.repository.setMusicState({ playing: true, current: nextTrack, queue });
  }

  async pause(): Promise<MusicState> {
    return this.repository.setMusicState({ playing: false });
  }

  async next(options: MusicOptions = {}): Promise<MusicState> {
    const current = this.repository.getMusicState();
    if (current.queue.length > 0) {
      const [nextTrack, ...queue] = current.queue;
      return this.repository.setMusicState({
        playing: Boolean(nextTrack),
        current: nextTrack ?? current.current,
        queue
      });
    }

    const configuredPlaylist = await this.resolveConfiguredPlaylist(options);
    if (configuredPlaylist.length > 0) {
      const currentIndex = configuredPlaylist.findIndex((item) => item.id === current.current?.id);
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % configuredPlaylist.length : 0;
      const nextTrack = configuredPlaylist[nextIndex];
      return this.repository.setMusicState({
        playing: true,
        current: nextTrack,
        queue: buildQueue(configuredPlaylist, nextTrack.id)
      });
    }

    const [nextTrack, ...queue] = current.queue;
    return this.repository.setMusicState({
      playing: Boolean(nextTrack),
      current: nextTrack ?? current.current,
      queue
    });
  }

  async mood(mood: string): Promise<MusicState> {
    return this.repository.setMusicState({ mood });
  }

  async search(query: string, options: MusicOptions = {}): Promise<{ provider: string; results: MusicTrack[] }> {
    if (options.enabled === false) {
      return { provider: "disabled", results: [] };
    }
    const serviceUrl = options.serviceUrl || this.config.musicServiceUrl;
    if (serviceUrl && options.provider !== "mock") {
      try {
        const response = await fetch(`${serviceUrl}/api/music/search?q=${encodeURIComponent(query)}`);
        if (response.ok) {
          const payload = (await response.json()) as { results?: MusicTrack[] };
          return { provider: "remote", results: payload.results ?? [] };
        }
      } catch {
        return { provider: "mock", results: mockSearch(query) };
      }
    }
    if (options.provider === "mineradio") {
      try {
        return { provider: "mineradio", results: await searchNeteaseSongs(query) };
      } catch (error) {
        return {
          provider: "mineradio",
          results: [],
          error: error instanceof Error ? error.message : String(error)
        } as { provider: string; results: MusicTrack[] };
      }
    }
    return { provider: "mock", results: mockSearch(query) };
  }

  async playlist(options: MusicOptions = {}): Promise<{ provider: string; trackIds: string[]; results: MusicTrack[] }> {
    const trackIds = normalizeTrackIds(options.playlistTrackIds);
    if (options.enabled === false) return { provider: "disabled", trackIds, results: [] };
    if (options.provider !== "mineradio") return { provider: options.provider ?? "mock", trackIds, results: [] };
    if (trackIds.length === 0) return { provider: "mineradio", trackIds, results: [] };
    return { provider: "mineradio", trackIds, results: await fetchNeteaseSongsByIds(trackIds) };
  }

  async tracksByIds(ids: string[], options: { enabled?: boolean; provider?: string } = {}): Promise<{ provider: string; results: MusicTrack[] }> {
    if (options.enabled === false) return { provider: "disabled", results: [] };
    if (options.provider !== "mineradio") return { provider: "mock", results: [] };
    return { provider: "mineradio", results: await fetchNeteaseSongsByIds(ids) };
  }

  private async resolveConfiguredPlaylist(options: MusicOptions = {}): Promise<MusicTrack[]> {
    const configured = await this.playlist({
      enabled: options.enabled,
      provider: options.provider,
      playlistTrackIds: options.playlistTrackIds
    });
    return configured.results;
  }
}

function defaultTrack(): MusicTrack {
  return {
    id: "mock-deep-focus",
    title: "深度专注模拟曲",
    artist: "认知工作站",
    durationSeconds: 1800
  };
}

function mockSearch(query: string): MusicTrack[] {
  return [
    {
      id: `mock-${query || "focus"}`,
      title: query ? `${query} 专注歌单` : "专注歌单",
      artist: "模拟音乐服务",
      durationSeconds: 2400
    }
  ];
}

function normalizeTrackIds(ids: string[] | undefined): string[] {
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => String(id).trim()).filter(Boolean);
}

function buildQueue(playlist: MusicTrack[], currentId: string): MusicTrack[] {
  if (playlist.length <= 1) return [];
  const currentIndex = playlist.findIndex((item) => item.id === currentId);
  if (currentIndex < 0) return playlist.slice();
  return [...playlist.slice(currentIndex + 1), ...playlist.slice(0, currentIndex)];
}
