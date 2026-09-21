"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Плеєр Day 4.
 *
 * Якщо є склеєний mp4 — грає його. Якщо ні — грає сегменти послідовно як
 * одне відео: onEnded перемикає на наступний. Субтитри — VTT-доріжка; для
 * сегментів беремо лише cue з вікна сегмента й зсуваємо їх у 0.
 *
 * Доріжку додаємо програмно (addTextTrack + VTTCue), а не через <track src>:
 * Safari не вмикає динамічно вставлену доріжку через `default` і ліниво
 * вантажить blob-URL, який до того часу вже може бути відкликаний.
 */

type Segment = { n: number; storage_url?: string; duration_sec?: number };
type Cue = { start: number; end: number; text: string };

const TRACK_LABEL = "Українська";

function toSec(t: string): number {
  // "MM:SS.mmm" або "HH:MM:SS.mmm"
  return t
    .replace(",", ".")
    .split(":")
    .map(Number)
    .reduce((acc, n) => acc * 60 + n, 0);
}

function parseVtt(vtt: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of vtt.replace(/\r\n?/g, "\n").split(/\n{2,}/)) {
    const lines = block.trim().split("\n");
    const at = lines.findIndex((l) => l.includes("-->"));
    if (at === -1) continue;
    const [from, to] = lines[at].split("-->");
    const start = toSec(from.trim());
    const end = toSec(to.trim().split(/\s+/)[0]);
    const text = lines.slice(at + 1).join("\n");
    if (Number.isFinite(start) && Number.isFinite(end) && text) {
      cues.push({ start, end, text });
    }
  }
  return cues;
}

// Cue, що потрапляють у [offset, offset+window), зсунуті так, щоб вікно починалось з 0.
function cuesForWindow(cues: Cue[], offsetSec: number, windowSec: number): Cue[] {
  const to = offsetSec + windowSec;
  return cues
    .filter((c) => c.end > offsetSec && c.start < to)
    .map((c) => ({
      start: Math.max(0, c.start - offsetSec),
      end: Math.min(c.end, to) - offsetSec,
      text: c.text,
    }));
}

export default function VideoPlayer({
  segments,
  mergedUrl,
  vtt,
}: {
  segments: Segment[];
  mergedUrl: string | null;
  vtt: string | null;
}) {
  const playable = useMemo(
    () => segments.filter((s) => s.storage_url).sort((a, b) => a.n - b.n),
    [segments],
  );
  const [idx, setIdx] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const merged = Boolean(mergedUrl);
  const current = merged ? null : playable[idx];
  const src = (merged ? mergedUrl : current?.storage_url) ?? undefined;
  const windowSec = current?.duration_sec ?? 8;

  const cues = useMemo(() => (vtt ? parseVtt(vtt) : []), [vtt]);

  // Субтитри: одна доріжка на <video>, cue перезаписуємо при зміні сегмента.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || cues.length === 0) return;

    const track =
      Array.from(video.textTracks).find((t) => t.label === TRACK_LABEL) ??
      video.addTextTrack("subtitles", TRACK_LABEL, "uk");

    while (track.cues && track.cues.length > 0) track.removeCue(track.cues[0]);
    const visible = merged ? cues : cuesForWindow(cues, idx * 8, windowSec);
    for (const c of visible) track.addCue(new VTTCue(c.start, c.end, c.text));
    track.mode = "showing";
  }, [cues, merged, idx, windowSec, src]);

  // Автоперехід між сегментами без паузи.
  useEffect(() => {
    if (idx > 0) videoRef.current?.play().catch(() => {});
  }, [idx]);

  if (!merged && playable.length === 0) {
    return (
      <p className="text-[13px] text-lo">
        Сегменти ще не збережені у Storage — запустіть генерацію з адмінки
        (кнопка «Зробити відео» на картці контенту), тоді посилання стануть
        постійними.
      </p>
    );
  }

  return (
    <div>
      <div className="mx-auto max-w-[320px] overflow-hidden rounded-xl border border-line bg-canvas-2">
        <video
          ref={videoRef}
          key={src}
          src={src}
          controls
          playsInline
          crossOrigin="anonymous"
          className="aspect-[9/16] w-full bg-black"
          onEnded={() => {
            if (!merged && idx < playable.length - 1) setIdx(idx + 1);
          }}
        />
      </div>

      {!merged && playable.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {playable.map((s, i) => (
            <button
              key={s.n}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Сегмент ${s.n}`}
              className={`h-1.5 rounded-full transition-all ${
                i === idx ? "w-8 bg-accent" : "w-4 bg-line-strong hover:bg-lo"
              }`}
            />
          ))}
          <span className="mono ml-3 text-[10.5px] text-lo">
            сегмент {idx + 1} / {playable.length}
          </span>
        </div>
      )}
    </div>
  );
}
