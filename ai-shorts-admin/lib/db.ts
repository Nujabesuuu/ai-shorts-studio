/**
 * Типи під фактичну схему Supabase-проєкту `school_day1`.
 *
 * public.projects      — картка ніші (id, niche, created_at)
 * public.day1_trends   — один тренд = один рядок (плоскі колонки, hashtags text[])
 * public.day2_topics   — тема контенту, опційно посилається на тренд Day 1
 */

/** Значення, що реально трапляються в day1_trends/day2_topics, плюс запас. */
export const PLATFORMS = [
  "tiktok",
  "instagram",
  "youtube",
  "reels",
  "shorts",
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const TOPIC_STATUSES = ["draft", "pending", "approved", "rejected"] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];

export type Project = {
  id: string;
  niche: string;
  created_at: string;
};

export type Day1Trend = {
  id: string;
  project_id: string;
  run_id: string;
  niche: string;
  platform: string;
  title: string;
  description: string | null;
  hook_idea: string | null;
  format: string | null;
  hashtags: string[] | null;
  created_at: string;
};

export type Day2Topic = {
  id: string;
  project_id: string | null;
  run_id: string | null;
  niche: string;
  platform: string | null;
  title: string;
  text: string | null;
  source_trend_id: string | null;
  status: string;
  created_at: string;
};

/** Клас бейджа платформи — кожна платформа має власний колір. */
export const PLATFORM_BADGE: Record<string, string> = {
  tiktok: "badge-cyan",
  instagram: "badge-violet",
  youtube: "badge-rose",
  reels: "badge-violet",
  shorts: "badge-amber",
};

export function platformBadge(platform: string | null): string {
  return PLATFORM_BADGE[platform ?? ""] ?? "badge-neutral";
}

/** Клас бейджа статусу теми Day 2. */
export const STATUS_BADGE: Record<string, string> = {
  approved: "badge-emerald",
  pending: "badge-amber",
  draft: "badge-neutral",
  rejected: "badge-rose",
};

export const STATUS_LABEL: Record<string, string> = {
  approved: "Затверджено",
  pending: "На розгляді",
  draft: "Чернетка",
  rejected: "Відхилено",
};

export function statusBadge(status: string): string {
  return STATUS_BADGE[status] ?? "badge-neutral";
}

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

/** «15 сер 2026, 18:04» */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("uk-UA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Короткий вигляд uuid для таблиць: `2fd72796` */
export function shortId(id: string | null): string {
  return id ? id.slice(0, 8) : "—";
}

/** Правильна форма іменника: 1 тренд / 2 тренди / 5 трендів */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/**
 * Хештеги в БД лежать як text[]. У формі — вільний рядок через кому
 * або пробіл; нормалізуємо до «#tag».
 */
export function parseHashtags(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim().replace(/^#+/, ""))
    .filter(Boolean)
    .map((t) => `#${t}`);
}

export function hashtagsToInput(tags: string[] | null): string {
  return (tags ?? []).join(" ");
}

/* ============================================================
   Day 3 — фінальний, готовий до публікації контент
   ============================================================ */

export const CONTENT_FORMATS = ["reels", "carousel", "stories"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export const CONTENT_STATUSES = ["ready", "needs_review", "rejected"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const FLOW_VERSIONS = ["baseline", "iter1", "iter2", "final"] as const;
export type FlowVersion = (typeof FLOW_VERSIONS)[number];

/** Кадр reels/stories або слайд carousel. */
export type ScriptFrame = {
  n?: number;
  t_start?: number;
  t_end?: number;
  visual?: string;
  voiceover?: string;
};

/**
 * Критик віддає {score, evidence}. Baseline-прогін віддавав просто число —
 * обидві форми лишаються читабельними, інакше старі рядки зникли б з UI.
 */
export type QualityEntry = { score?: number; evidence?: string };
export type Quality = Record<string, QualityEntry | number | null | undefined>;

export type Day3Content = {
  id: string;
  project_id: string | null;
  topic_id: string | null;
  source_trend_id: string | null;
  run_id: string | null;
  niche: string;
  platform: string | null;
  format: string;
  title: string;
  hook: string | null;
  hook_alt: string | null;
  script: unknown;
  onscreen_text: string | null;
  caption: string | null;
  hashtags: string[] | null;
  cta: string | null;
  duration_sec: number | null;
  quality: Quality | null;
  quality_score: number | string | null;
  repaired: boolean;
  status: string;
  model: string | null;
  flow_version: string | null;
  created_at: string;
};

export type Day3Run = {
  id: string;
  workflow_run_id: string | null;
  flow_version: string;
  attempt: number;
  label: string | null;
  project_id: string | null;
  niche: string | null;
  n_items: number | null;
  total_tokens: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  elapsed_sec: number | string | null;
  llm_calls: number | null;
  items_produced: number | null;
  items_repaired: number | null;
  avg_quality: number | string | null;
  by_criterion: Record<string, number> | null;
  status: string;
  notes: string | null;
  created_at: string;
};

export type Day3RunNode = {
  id: string;
  run_id: string;
  seq: number | null;
  node_id: string | null;
  node_title: string | null;
  node_type: string | null;
  total_tokens: number | null;
  elapsed_sec: number | string | null;
  status: string | null;
};

/**
 * Рубрика якості. Ваги — не декорація: за ними рахується quality_score
 * у code-ноді флоу, і тут вони мусять збігатися з dify/build_dsl.py.
 */
export const RUBRIC = [
  {
    key: "traceability",
    label: "Простежуваність",
    weight: 25,
    hint: "Контент справді про свій тренд або тему, а не про щось поруч",
  },
  {
    key: "production_ready",
    label: "Готовність до зйомки",
    weight: 25,
    hint: "Кадри з таймкодами, візуалом і войсовером — без додаткових питань",
  },
  {
    key: "hook",
    label: "Хук",
    weight: 20,
    hint: "Сила перших 0-3 секунд",
  },
  {
    key: "format_fit",
    label: "Відповідність формату",
    weight: 15,
    hint: "Кількість кадрів і тривалість у межах обраного формату",
  },
  {
    key: "uniqueness",
    label: "Унікальність",
    weight: 15,
    hint: "Не дублює вже наявні заголовки проєкту",
  },
] as const;

export type RubricKey = (typeof RUBRIC)[number]["key"];

/** Дістає бал незалежно від того, це {score, evidence} чи голе число. */
export function criterionScore(quality: Quality | null, key: string): number | null {
  const entry = quality?.[key];
  if (entry == null) return null;
  if (typeof entry === "number") return entry;
  return typeof entry.score === "number" ? entry.score : null;
}

export function criterionEvidence(quality: Quality | null, key: string): string | null {
  const entry = quality?.[key];
  if (entry == null || typeof entry === "number") return null;
  return entry.evidence?.trim() || null;
}

export const FORMAT_BADGE: Record<string, string> = {
  reels: "badge-violet",
  carousel: "badge-cyan",
  stories: "badge-amber",
};

export const FORMAT_LABEL: Record<string, string> = {
  reels: "reels",
  carousel: "carousel",
  stories: "stories",
};

export function formatBadge(format: string | null): string {
  return FORMAT_BADGE[format ?? ""] ?? "badge-neutral";
}

export const CONTENT_STATUS_BADGE: Record<string, string> = {
  ready: "badge-emerald",
  needs_review: "badge-amber",
  rejected: "badge-rose",
};

export const CONTENT_STATUS_LABEL: Record<string, string> = {
  ready: "Готово",
  needs_review: "На перегляд",
  rejected: "Відхилено",
};

export function contentStatusBadge(status: string): string {
  return CONTENT_STATUS_BADGE[status] ?? "badge-neutral";
}

export function contentStatusLabel(status: string): string {
  return CONTENT_STATUS_LABEL[status] ?? status;
}

/** Колірний тон бала: ≥85 готово, ≥70 на перегляд, нижче — відхилено. */
export function scoreTone(score: number | null): "emerald" | "amber" | "rose" | "lo" {
  if (score == null) return "lo";
  if (score >= 85) return "emerald";
  if (score >= 70) return "amber";
  return "rose";
}

export const TONE_TEXT: Record<string, string> = {
  emerald: "text-emerald",
  amber: "text-amber",
  rose: "text-rose",
  lo: "text-lo",
};

export const TONE_BG: Record<string, string> = {
  emerald: "bg-emerald",
  amber: "bg-amber",
  rose: "bg-rose",
  lo: "bg-line-strong",
};

/** quality_score приїжджає з postgres numeric як рядок. */
export function num(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** script — jsonb; на практиці масив, але буває рядок із JSON усередині. */
export function parseScript(raw: unknown): ScriptFrame[] {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value.filter((f): f is ScriptFrame => typeof f === "object" && f !== null);
}

/** 0 → «0:00», 95 → «1:35» */
export function clock(sec: number | null | undefined): string {
  const s = Math.max(0, Math.round(sec ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function flowVersionBadge(v: string | null): string {
  if (v === "final") return "badge-accent";
  if (v === "baseline") return "badge-neutral";
  return "badge-cyan";
}

/* ============================================================
   Day 4 — відео зі сценаріїв Day 3
   ============================================================ */

export type VideoSegment = {
  n: number;
  duration_sec?: number;
  prompt?: string;
  dify_url?: string;
  storage_url?: string;
};

export type Day4Video = {
  id: string;
  content_id: string | null;
  project_id: string | null;
  run_id: string | null;
  niche: string | null;
  title: string;
  platform: string | null;
  use_rag: boolean;
  video_model: string | null;
  status: string;
  caption: string | null;
  brand_alignment: string | null;
  missing_from_brandbook: string | null;
  frames: { n: number; url: string }[] | null;
  segments: VideoSegment[] | null;
  video_url: string | null;
  subtitles_vtt: string | null;
  publish_at: string | null;
  approved_by: string | null;
  created_at: string;
};

export const VIDEO_STATUS_BADGE: Record<string, string> = {
  pending_review: "badge-amber",
  approved: "badge-emerald",
  rejected: "badge-rose",
  rendering: "badge-cyan",
  failed: "badge-rose",
};

export const VIDEO_STATUS_LABEL: Record<string, string> = {
  pending_review: "Чекає затвердження",
  approved: "Затверджено",
  rejected: "Відхилено",
  rendering: "Рендериться",
  failed: "Помилка",
};

export function videoStatusBadge(s: string): string {
  return VIDEO_STATUS_BADGE[s] ?? "badge-neutral";
}
export function videoStatusLabel(s: string): string {
  return VIDEO_STATUS_LABEL[s] ?? s;
}

/** Сегменти можуть приїхати рядком jsonb — нормалізуємо до масиву. */
export function parseSegments(raw: unknown): VideoSegment[] {
  let v = raw;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { return []; }
  }
  if (!Array.isArray(v)) return [];
  return v.filter((s): s is VideoSegment => typeof s === "object" && s !== null);
}
