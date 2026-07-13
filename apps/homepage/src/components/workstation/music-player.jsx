import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  LuAudioLines,
  LuDisc3,
  LuListMusic,
  LuPause,
  LuPlay,
  LuRefreshCcw,
  LuRepeat,
  LuSettings2,
  LuShuffle,
  LuSkipBack,
  LuSkipForward,
  LuVolume2,
  LuVolumeX,
} from "react-icons/lu";

import MineradioParticleField from "components/workstation/MineradioParticleField";
import { buildMusicStreamUrl } from "components/workstation/music-stream";

const FALLBACK_COVER = "/workstation/blog-background/background.png";
const PLAY_MODE_LABELS = {
  loop: "列表循环",
  single: "单曲循环",
  random: "随机播放",
};

function getTitle(song) {
  return song?.title || song?.name || "未知歌曲";
}

function getArtist(song) {
  return song?.artist || song?.author || "未知歌手";
}

function getCover(song) {
  return song?.cover || song?.coverUrl || song?.pic || FALLBACK_COVER;
}

function parseLyrics(song) {
  const raw = song?.lyric || song?.lrc || (typeof song?.lyrics === "string" ? song.lyrics : "");
  if (!raw) return [];

  const parsed = [];
  const lines = raw.split(/\r?\n/);
  const timeExp = /\[(\d{2,}):(\d{2})(?:[.:](\d{2,3}))?\]/g;
  let hasTimedLine = false;

  for (const line of lines) {
    const text = line.replace(/\[\d{2,}:\d{2}(?:[.:]\d{2,3})?\]/g, "").trim();
    if (!text) continue;

    let match;
    while ((match = timeExp.exec(line)) !== null) {
      hasTimedLine = true;
      const min = Number.parseInt(match[1], 10);
      const sec = Number.parseInt(match[2], 10);
      const ms = match[3] ? Number.parseInt(match[3], 10) / (match[3].length === 3 ? 1000 : 100) : 0;
      parsed.push({ time: min * 60 + sec + ms, text });
    }
  }

  if (hasTimedLine) return parsed.sort((left, right) => left.time - right.time);
  return lines.map((line) => ({ time: -1, text: line.trim() })).filter((line) => line.text);
}

function formatTime(time) {
  if (!time || Number.isNaN(time)) return "0:00";
  const mins = Math.floor(time / 60);
  const secs = Math.floor(time % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export default function WorkstationMusicPlayer({ embedded = false, showSettingsLink = true }) {
  const { data: currentData, mutate: mutateCurrent } = useSWR("/api/workstation/music/current", fetchJson, {
    refreshInterval: 30000,
  });
  const { data: playlistData, mutate: mutatePlaylist, error: playlistError, isLoading } = useSWR(
    "/api/workstation/music/playlist",
    fetchJson,
    { refreshInterval: 30000 }
  );

  const audioRef = useRef(null);
  const lyricContainerRef = useRef(null);
  const activeLyricRef = useRef(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.82);
  const [isMuted, setIsMuted] = useState(false);
  const [playMode, setPlayMode] = useState("loop");
  const [activePanel, setActivePanel] = useState("lyrics");
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [notice, setNotice] = useState("");

  const playlist = useMemo(() => {
    const tracks = Array.isArray(playlistData?.results) ? playlistData.results : [];
    if (tracks.length > 0) return tracks;
    return currentData?.current ? [currentData.current] : [];
  }, [currentData?.current, playlistData?.results]);

  const currentSong = playlist[currentIndex];
  const audioSrc = useMemo(() => buildMusicStreamUrl(currentSong), [currentSong?.id, currentSong?.url]);
  const parsedLyrics = useMemo(() => parseLyrics(currentSong), [currentSong]);
  const activeLyricIndex = useMemo(() => {
    if (parsedLyrics.length === 0) return -1;
    const firstFutureIndex = parsedLyrics.findIndex((line) => line.time > currentTime);
    if (firstFutureIndex === -1) return parsedLyrics.length - 1;
    return Math.max(0, firstFutureIndex - 1);
  }, [currentTime, parsedLyrics]);

  useEffect(() => {
    const sync = () => {
      mutateCurrent();
      mutatePlaylist();
    };

    window.addEventListener("workstation-music-sync", sync);
    return () => window.removeEventListener("workstation-music-sync", sync);
  }, [mutateCurrent, mutatePlaylist]);

  useEffect(() => {
    if (!playlist.length) {
      setCurrentIndex(0);
      return;
    }
    const currentId = currentData?.current?.id;
    if (!currentId) {
      setCurrentIndex(0);
      return;
    }
    const matchedIndex = playlist.findIndex((track) => track.id === currentId);
    if (matchedIndex >= 0) setCurrentIndex(matchedIndex);
  }, [currentData?.current?.id, playlist]);

  useEffect(() => {
    setIsPlaying(Boolean(currentData?.playing));
  }, [currentData?.playing]);

  useEffect(() => {
    setCurrentTime(0);
    setProgress(0);
    setDuration(currentSong?.durationSeconds || 0);
  }, [currentSong?.id, currentSong?.durationSeconds]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = isMuted ? 0 : volume;
  }, [isMuted, volume]);

  useEffect(() => {
    if (!audioRef.current || !audioSrc) return;
    if (!isPlaying) {
      audioRef.current.pause();
      return;
    }
    const playPromise = audioRef.current.play();
    if (playPromise?.catch) {
      playPromise.catch((error) => {
        setNotice(error instanceof Error ? error.message : String(error));
        setIsPlaying(false);
      });
    }
  }, [audioSrc, isPlaying]);

  useEffect(() => {
    if (!activeLyricRef.current || !lyricContainerRef.current || activePanel !== "lyrics") return;

    const container = lyricContainerRef.current;
    const activeItem = activeLyricRef.current;
    const scrollTarget = activeItem.offsetTop - container.offsetHeight / 2 + activeItem.offsetHeight / 2;
    container.scrollTo({ top: scrollTarget, behavior: "smooth" });
  }, [activeLyricIndex, activePanel]);

  async function refreshAll() {
    await Promise.all([mutateCurrent(), mutatePlaylist()]);
  }

  function announceMusicSync() {
    window.dispatchEvent(new Event("workstation-music-sync"));
  }

  async function syncPlay(nextIndex) {
    const nextSong = playlist[nextIndex];
    if (!nextSong) return;

    try {
      setNotice("");
      setCurrentIndex(nextIndex);
      setCurrentTime(0);
      setProgress(0);
      await postJson("/api/workstation/music/play", { track: nextSong });
      setIsPlaying(true);
      await mutateCurrent();
      announceMusicSync();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function togglePlay() {
    if (!currentSong) return;

    try {
      setNotice("");
      if (isPlaying) {
        if (audioRef.current) audioRef.current.pause();
        await postJson("/api/workstation/music/pause", {});
        setIsPlaying(false);
      } else {
        await postJson("/api/workstation/music/play", { track: currentSong });
        setIsPlaying(true);
      }
      await mutateCurrent();
      announceMusicSync();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function prevSong() {
    if (!playlist.length) return;
    const nextIndex =
      playMode === "random" ? Math.floor(Math.random() * playlist.length) : (currentIndex - 1 + playlist.length) % playlist.length;
    await syncPlay(nextIndex);
  }

  async function nextSong() {
    if (!playlist.length) return;
    const nextIndex =
      playMode === "random" ? Math.floor(Math.random() * playlist.length) : (currentIndex + 1) % playlist.length;
    await syncPlay(nextIndex);
  }

  async function handleEnded() {
    if (playMode === "single" && audioRef.current) {
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
      return;
    }
    await nextSong();
  }

  function handleTimeUpdate() {
    if (!audioRef.current) return;
    const nextDuration = audioRef.current.duration || currentSong?.durationSeconds || 0;
    setDuration(nextDuration);
    setCurrentTime(audioRef.current.currentTime);
    setProgress(nextDuration > 0 ? (audioRef.current.currentTime / nextDuration) * 100 : 0);
  }

  function seekToPercent(nextProgress) {
    setProgress(nextProgress);
    if (!audioRef.current || !audioRef.current.duration) return;
    audioRef.current.currentTime = (nextProgress / 100) * audioRef.current.duration;
  }

  function retry() {
    setNotice("");
    refreshAll();
  }

  const playModeLabel = PLAY_MODE_LABELS[playMode] ?? PLAY_MODE_LABELS.loop;
  const playModeIcon =
    playMode === "random" ? (
      <LuShuffle size={18} aria-hidden="true" />
    ) : playMode === "single" ? (
      <LuRefreshCcw size={18} aria-hidden="true" />
    ) : (
      <LuRepeat size={18} aria-hidden="true" />
    );

  if (isLoading) {
    return (
      <MusicStateCard
        embedded={embedded}
        icon={<LuDisc3 size={40} className="animate-spin text-indigo-500" aria-hidden="true" />}
        title="正在加载音乐"
        description="正在准备播放列表，请稍候。"
      />
    );
  }

  if (!currentSong) {
    return (
      <MusicStateCard
        embedded={embedded}
        action={
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a className="rounded-full bg-indigo-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25" href="/settings/workstation">
              去填歌曲
            </a>
            <button
              className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700"
              onClick={retry}
              type="button"
            >
              重新加载
            </button>
          </div>
        }
        icon={<LuAudioLines size={36} className="text-indigo-500" aria-hidden="true" />}
        title="还没有可播放歌曲"
        description={playlistError ? String(playlistError) : "先去设置里填网易云歌曲 ID。"}
      />
    );
  }

  return (
    <div className={embedded ? "workstation-music-shell flex w-full min-w-0 flex-col gap-5" : "workstation-music-shell relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 pb-10 pt-24 sm:px-6 md:pt-28 lg:px-10"}>
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-2 text-sm font-bold text-indigo-600">音乐</p>
          <h1 className="text-3xl font-black text-slate-900 sm:text-4xl md:text-5xl">正在播放</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/80 px-4 py-2 text-sm font-bold text-slate-700 shadow-sm backdrop-blur-xl">
            <span className={`h-2.5 w-2.5 rounded-full ${isPlaying ? "animate-pulse bg-emerald-500" : "bg-slate-400"}`} />
            {isPlaying ? "播放中" : "已暂停"}
          </span>
          {showSettingsLink ? (
            <a className="inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/80 px-4 py-2 text-sm font-bold text-slate-700 shadow-sm backdrop-blur-xl" href="/settings/workstation">
              <LuSettings2 size={16} aria-hidden="true" />
              音乐设置
            </a>
          ) : null}
        </div>
      </header>

      {notice ? (
        <div className="rounded-2xl border border-amber-300/40 bg-amber-500/15 px-4 py-3 text-sm text-amber-950 backdrop-blur-xl">
          {notice}
        </div>
      ) : null}

      <section className="workstation-music-layout grid gap-5">
        <article className={`workstation-music-main relative isolate overflow-hidden rounded-3xl border border-white/50 bg-white/55 shadow-xl backdrop-blur-xl ${embedded ? "h-[560px] min-h-0" : "min-h-[640px]"}`}>
          <div className="absolute inset-0 bg-cover bg-center opacity-20 saturate-125" style={{ backgroundImage: `url(${getCover(currentSong)})` }} />
          <div className="absolute inset-0 bg-gradient-to-br from-white/80 via-white/55 to-indigo-100/40" />
          <MineradioParticleField
            className="z-[1] opacity-45 mix-blend-multiply"
            coverUrl={getCover(currentSong)}
            currentTime={currentTime}
            isPlaying={isPlaying}
            progress={progress || 0}
            seed={currentSong.id}
            volume={isMuted ? 0 : volume || 0}
          />

          <div className={`relative z-10 flex h-full flex-col justify-between p-5 sm:p-7 md:p-8 ${embedded ? "min-h-0" : "min-h-[640px]"}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="rounded-full border border-white/60 bg-white/75 px-4 py-2 text-sm font-bold text-slate-600 shadow-sm backdrop-blur-xl">
                {playModeLabel}
              </p>
              <p className="rounded-full border border-white/60 bg-white/75 px-4 py-2 text-sm font-bold text-slate-600 shadow-sm backdrop-blur-xl">
                {currentIndex + 1} / {playlist.length}
              </p>
            </div>

            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center py-8">
              <div className="relative aspect-square w-[min(70vw,340px)]">
                <div className="relative h-full w-full overflow-hidden rounded-3xl border border-white/60 bg-white/60 shadow-xl">
                  <img alt={`${getTitle(currentSong)} 封面`} className="h-full w-full object-cover" referrerPolicy="no-referrer" src={getCover(currentSong)} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-white/10" />
                </div>
              </div>

              <div className="mt-8 w-full text-center">
                <h2 className="mx-auto max-w-3xl text-balance text-3xl font-black text-slate-900 sm:text-4xl md:text-5xl">{getTitle(currentSong)}</h2>
                <p className="mt-3 text-sm font-bold text-slate-600">{getArtist(currentSong)}</p>
              </div>

              <div className="relative mt-8 flex h-16 w-full max-w-lg items-end justify-center gap-1.5 overflow-hidden rounded-full border border-white/60 bg-white/55 px-5 pb-3 shadow-inner" aria-hidden="true">
                <div className="absolute inset-x-8 top-4 h-px bg-gradient-to-r from-transparent via-indigo-300/40 to-transparent" />
                {Array.from({ length: 28 }).map((_, index) => (
                  <span
                    key={index}
                    className={`w-1.5 rounded-full bg-gradient-to-t from-indigo-500 via-sky-400 to-pink-400 shadow-[0_0_16px_rgba(99,102,241,0.24)] ${isPlaying ? "workstation-radio-wave" : ""}`}
                    style={{
                      height: `${14 + ((index * 13) % 36)}px`,
                      animationDelay: `${index * 70}ms`,
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/60 bg-white/70 p-4 shadow-xl backdrop-blur-xl">
              <div className="mb-4 flex items-center gap-3">
                <span className="w-12 text-right text-xs font-black tabular-nums text-slate-500">{formatTime(currentTime)}</span>
                <input
                  aria-label="播放进度"
                  className="h-2 flex-1 cursor-pointer appearance-none rounded-full"
                  max="100"
                  min="0"
                  onChange={(event) => seekToPercent(Number(event.target.value))}
                  style={{ background: `linear-gradient(to right, #6366f1 ${progress || 0}%, rgba(148,163,184,0.35) 0)` }}
                  type="range"
                  value={progress || 0}
                />
                <span className="w-12 text-xs font-black tabular-nums text-slate-500">{formatTime(duration)}</span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  aria-label={`切换播放模式，当前为${playModeLabel}`}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-white/60 bg-white/70 text-slate-700 transition hover:border-indigo-300 hover:text-indigo-600"
                  onClick={() => setPlayMode((value) => (value === "loop" ? "single" : value === "single" ? "random" : "loop"))}
                  title={playModeLabel}
                  type="button"
                >
                  {playModeIcon}
                </button>

                <div className="flex items-center gap-3 sm:gap-5">
                  <button
                    aria-label="上一首"
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-white/60 bg-white/70 text-slate-700 transition hover:border-indigo-300 hover:text-indigo-600"
                    onClick={prevSong}
                    type="button"
                  >
                    <LuSkipBack size={22} aria-hidden="true" />
                  </button>
                  <button
                    aria-label={isPlaying ? "暂停" : "播放"}
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 transition hover:scale-105 hover:bg-indigo-600"
                    onClick={togglePlay}
                    type="button"
                  >
                    {isPlaying ? <LuPause size={28} aria-hidden="true" /> : <LuPlay className="ml-1" size={28} aria-hidden="true" />}
                  </button>
                  <button
                    aria-label="下一首"
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-white/60 bg-white/70 text-slate-700 transition hover:border-indigo-300 hover:text-indigo-600"
                    onClick={nextSong}
                    type="button"
                  >
                    <LuSkipForward size={22} aria-hidden="true" />
                  </button>
                </div>

                <div className="relative flex items-center" onMouseLeave={() => setShowVolumeSlider(false)}>
                  {showVolumeSlider ? (
                    <div className="absolute bottom-14 right-0 overflow-hidden rounded-full border border-white/60 bg-white/90 px-4 py-3 shadow-lg backdrop-blur-xl md:bottom-auto md:right-12">
                      <input
                        aria-label="音量"
                        className="h-1 w-20 cursor-pointer appearance-none rounded-full"
                        max="1"
                        min="0"
                        onChange={(event) => {
                          const nextVolume = Number(event.target.value);
                          setVolume(nextVolume);
                          if (isMuted && nextVolume > 0) setIsMuted(false);
                        }}
                        step="0.01"
                        style={{ background: `linear-gradient(to right, #ec4899 ${(volume || 0) * 100}%, rgba(148,163,184,0.35) 0)` }}
                        type="range"
                        value={isMuted ? 0 : volume || 0}
                      />
                    </div>
                  ) : null}
                  <button
                    aria-label={isMuted || volume === 0 ? "打开音量控制，当前静音" : "打开音量控制"}
                    className={`flex h-11 w-11 items-center justify-center rounded-full border transition ${
                      showVolumeSlider
                        ? "border-pink-300 bg-pink-500 text-white shadow-lg shadow-pink-500/20"
                        : "border-white/60 bg-white/70 text-slate-700 hover:text-pink-600"
                    }`}
                    onClick={() => setShowVolumeSlider((value) => !value)}
                    onDoubleClick={() => setIsMuted((value) => !value)}
                    title="单击调节音量，双击静音"
                    type="button"
                  >
                    {isMuted || volume === 0 ? <LuVolumeX size={19} aria-hidden="true" /> : <LuVolume2 size={19} aria-hidden="true" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </article>

        <aside className={`workstation-music-info flex flex-col rounded-3xl border border-white/50 bg-white/60 shadow-xl backdrop-blur-xl ${embedded ? "h-[560px] min-h-0" : "min-h-[640px]"}`}>
          <div className="flex items-center justify-between border-b border-white/50 p-4">
            <h2 className="text-xl font-black text-slate-900">播放信息</h2>
            <div className="flex rounded-full border border-white/60 bg-white/65 p-1">
              <button
                aria-pressed={activePanel === "lyrics"}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-black transition ${
                  activePanel === "lyrics" ? "bg-indigo-500 text-white shadow-sm" : "text-slate-600 hover:text-indigo-600"
                }`}
                onClick={() => setActivePanel("lyrics")}
                type="button"
              >
                <LuAudioLines size={14} aria-hidden="true" />
                歌词
              </button>
              <button
                aria-pressed={activePanel === "queue"}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-black transition ${
                  activePanel === "queue" ? "bg-indigo-500 text-white shadow-sm" : "text-slate-600 hover:text-indigo-600"
                }`}
                onClick={() => setActivePanel("queue")}
                type="button"
              >
                <LuListMusic size={14} aria-hidden="true" />
                列表
              </button>
            </div>
          </div>

          <div className="relative flex-1 overflow-hidden">
            {activePanel === "lyrics" ? (
              <>
                <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 h-20 bg-gradient-to-b from-white/95 to-transparent" />
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-24 bg-gradient-to-t from-white/95 to-transparent" />
                <div ref={lyricContainerRef} className="workstation-music-scrollbar workstation-lyric-mask h-full overflow-y-auto px-5">
                  <div className={`flex min-h-full flex-col gap-4 ${embedded ? "py-48" : "py-[34vh]"}`}>
                    {parsedLyrics.length > 0 ? (
                      parsedLyrics.map((line, index) => {
                        const isActive = index === activeLyricIndex;
                        const canSeek = line.time >= 0 && duration > 0;
                        return (
                          <button
                            key={`${line.time}-${index}`}
                            ref={isActive ? activeLyricRef : null}
                            aria-current={isActive ? "true" : undefined}
                            className={`rounded-2xl px-4 py-3 text-left transition ${
                              isActive ? "bg-indigo-500/10 text-indigo-700 shadow-sm" : "text-slate-500 hover:bg-white/50 hover:text-slate-800"
                            }`}
                            disabled={!canSeek}
                            onClick={() => canSeek && seekToPercent((line.time / duration) * 100)}
                            type="button"
                          >
                            <span className={`block leading-relaxed ${isActive ? "text-xl font-black" : "text-sm font-bold"}`}>{line.text}</span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center">
                        <LuAudioLines className="mb-5 animate-pulse text-indigo-500/60" size={34} aria-hidden="true" />
                        <p className="text-lg font-black text-indigo-700">暂无歌词</p>
                        <p className="mt-3 max-w-xs text-sm font-medium leading-6 text-slate-500">当前歌曲没有时间轴歌词时，这里只显示当前播放状态。</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="workstation-music-scrollbar absolute inset-0 overflow-y-auto p-4">
                <div className="flex flex-col gap-2.5">
                  {playlist.map((song, index) => {
                    const isActive = index === currentIndex;
                    return (
                      <button
                        key={`${song.id}-${index}`}
                        aria-current={isActive ? "true" : undefined}
                        className={`grid grid-cols-[52px_minmax(0,1fr)] items-center gap-3 rounded-2xl border p-3 text-left transition ${
                          isActive ? "border-indigo-400/50 bg-indigo-500/10" : "border-white/50 bg-white/50 hover:border-indigo-300/50 hover:bg-white/70"
                        }`}
                        onClick={() => syncPlay(index)}
                        type="button"
                      >
                        <span className="relative h-12 w-12 overflow-hidden rounded-xl bg-slate-200">
                          <img alt={`${getTitle(song)} 封面`} className="h-12 w-12 object-cover" referrerPolicy="no-referrer" src={getCover(song)} />
                          {isActive ? (
                            <span className="absolute inset-0 flex items-center justify-center bg-indigo-600/55 backdrop-blur-[1px]">
                              <LuAudioLines className={isPlaying ? "animate-pulse text-white" : "text-indigo-100"} size={17} aria-hidden="true" />
                            </span>
                          ) : null}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black text-slate-900">{getTitle(song)}</span>
                          <span className="mt-1 block truncate text-xs font-medium text-slate-500">{getArtist(song)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </aside>
      </section>

      {audioSrc ? (
        <audio ref={audioRef} onEnded={handleEnded} onLoadedMetadata={handleTimeUpdate} onTimeUpdate={handleTimeUpdate} preload="metadata" src={audioSrc} />
      ) : null}

      <style jsx global>{`
        .workstation-music-tab,
        .workstation-music-shell,
        .workstation-music-layout,
        .workstation-music-main,
        .workstation-music-info {
          min-width: 0;
          width: 100%;
        }
        .workstation-music-layout {
          grid-template-columns: minmax(0, 1fr) minmax(320px, 360px);
          align-items: stretch;
        }
        .workstation-music-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .workstation-music-scrollbar::-webkit-scrollbar-track {
          background: rgba(148, 163, 184, 0.14);
          border-radius: 999px;
        }
        .workstation-music-scrollbar::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, rgba(99, 102, 241, 0.86), rgba(236, 72, 153, 0.58));
          border-radius: 999px;
        }
        .workstation-lyric-mask {
          -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 14%, black 86%, transparent 100%);
          mask-image: linear-gradient(to bottom, transparent 0%, black 14%, black 86%, transparent 100%);
        }
        .workstation-radio-wave {
          animation: workstationRadioWave 1.3s ease-in-out infinite alternate;
          transform-origin: bottom;
        }
        @keyframes workstationRadioWave {
          0% {
            transform: scaleY(0.42);
            opacity: 0.45;
          }
          100% {
            transform: scaleY(1);
            opacity: 1;
          }
        }
        @media (max-width: 960px) {
          .workstation-music-layout {
            grid-template-columns: minmax(0, 1fr);
          }
          .workstation-music-info {
            min-height: 520px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .workstation-radio-wave {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}

function MusicStateCard({ embedded, icon, title, description, action = null }) {
  return (
    <section className={embedded ? "rounded-3xl border border-slate-200 bg-white/80 p-8 text-center shadow-sm backdrop-blur-xl" : "relative z-10 flex min-h-screen items-center justify-center px-6 py-24"}>
      <div className={embedded ? "mx-auto w-full max-w-lg" : "w-full max-w-lg rounded-3xl border border-white/40 bg-white/50 p-8 text-center shadow-xl backdrop-blur-xl"}>
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/70 shadow-sm">{icon}</div>
        <h1 className="text-3xl font-black text-slate-900">{title}</h1>
        <p className="mt-4 text-sm leading-7 text-slate-600">{description}</p>
        {action}
      </div>
    </section>
  );
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json();
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json();
}

async function readError(response) {
  const text = await response.text();
  try {
    const payload = JSON.parse(text);
    return payload.detail || payload.error || response.statusText;
  } catch {
    return text || response.statusText;
  }
}
