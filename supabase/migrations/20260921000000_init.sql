-- ============================================================
--  AI Shorts Studio — схема бази (Supabase / Postgres)
--
--  Пайплайн: ніша → тренди (Day 1) → теми з ручним затвердженням (Day 2)
--            → контент (Day 3) → відео (Day 4).
--
--  Джерело істини для цієї схеми — код адмінки (ai-shorts-admin/lib/db.ts
--  та Server Actions) і Dify-флоу (dify/build_dsl*.py). Це відновлена схема,
--  а не pg_dump: якщо додасте колонку в код, додайте нову міграцію.
--
--  Безпека: RLS тут ВИМКНЕНО (режим воркшопу — Dify пише publishable-ключем).
--  Для публічного демо застосуйте supabase/policies_demo_readonly.sql.
-- ============================================================

-- ---------- projects: ніша ----------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  niche       text not null,
  created_at  timestamptz not null default now()
);

-- ---------- Day 1: тренди (один тренд = один рядок) ----------
create table if not exists public.day1_trends (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  run_id       uuid not null default gen_random_uuid(),
  niche        text not null,
  platform     text not null,
  title        text not null,
  description  text,                       -- markdown
  hook_idea    text,
  format       text,
  hashtags     text[],
  created_at   timestamptz not null default now()
);

-- ---------- Day 2: теми + HITL-гейт (status) ----------
-- Каскадом з проєктом НЕ видаляються: адмінка знімає їх сама перед видаленням проєкту.
create table if not exists public.day2_topics (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid references public.projects(id),
  run_id           uuid default gen_random_uuid(),
  niche            text not null,
  platform         text,
  title            text not null,
  text             text,                   -- markdown
  source_trend_id  uuid references public.day1_trends(id),  -- тренд із темою не видалити
  status           text not null default 'pending'
                   check (status in ('draft', 'pending', 'approved', 'rejected')),
  created_at       timestamptz not null default now()
);

-- ---------- Day 3: готовий контент ----------
create table if not exists public.day3_content (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid references public.projects(id) on delete cascade,
  topic_id         uuid references public.day2_topics(id) on delete set null,
  source_trend_id  uuid references public.day1_trends(id) on delete set null,
  run_id           uuid default gen_random_uuid(),
  niche            text not null,
  platform         text,
  format           text not null check (format in ('reels', 'carousel', 'stories')),
  title            text not null,
  hook             text,
  hook_alt         text,                   -- A/B-варіант хука
  script           jsonb,                  -- [{n, t_start, t_end, visual, voiceover}]
  onscreen_text    text,
  caption          text,
  hashtags         text[],
  cta              text,
  duration_sec     integer,
  quality          jsonb,                  -- {criterion: {score, evidence}}
  quality_score    numeric,                -- зважена рубрика, рахує code-нода флоу
  repaired         boolean not null default false,
  status           text not null default 'ready'
                   check (status in ('ready', 'needs_review', 'rejected')),
  model            text,
  flow_version     text,                   -- baseline | iter1 | iter2 | final
  created_at       timestamptz not null default now()
);

-- ---------- Day 3: бенчмарк прогонів («до/після») ----------
create table if not exists public.day3_runs (
  id                 uuid primary key default gen_random_uuid(),
  workflow_run_id    uuid,
  flow_version       text not null,
  attempt            integer not null default 1,
  label              text,
  project_id         uuid references public.projects(id) on delete set null,
  niche              text,
  n_items            integer,
  total_tokens       integer,
  prompt_tokens      integer,
  completion_tokens  integer,
  elapsed_sec        numeric,
  llm_calls          integer,
  items_produced     integer,
  items_repaired     integer,
  avg_quality        numeric,
  by_criterion       jsonb,                -- {criterion: середній бал}
  status             text not null default 'succeeded',
  notes              text,
  created_at         timestamptz not null default now()
);

create table if not exists public.day3_run_nodes (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references public.day3_runs(id) on delete cascade,
  seq            integer,
  node_id        text,
  node_title     text,
  node_type      text,
  total_tokens   integer,
  elapsed_sec    numeric,
  status         text
);

-- ---------- Day 4: відео зі сценаріїв Day 3 ----------
create table if not exists public.day4_videos (
  id                      uuid primary key default gen_random_uuid(),
  content_id              uuid references public.day3_content(id) on delete set null,
  project_id              uuid references public.projects(id) on delete cascade,
  run_id                  uuid default gen_random_uuid(),
  niche                   text,
  title                   text not null,
  platform                text,
  use_rag                 boolean not null default true,   -- з бренд-буком чи без
  video_model             text,
  status                  text not null default 'pending_review'
                          check (status in ('pending_review', 'approved', 'rejected',
                                            'rendering', 'failed')),
  caption                 text,
  brand_alignment         text,
  missing_from_brandbook  text,
  frames                  jsonb,           -- [{n, url}]
  segments                jsonb,           -- [{n, duration_sec, prompt, dify_url, storage_url}]
  video_url               text,            -- склеєний mp4
  subtitles_vtt           text,
  publish_at              timestamptz,
  approved_by             text,
  created_at              timestamptz not null default now()
);

-- ---------- індекси під фільтри адмінки й перевірки флоу ----------
create index if not exists day1_trends_project_idx   on public.day1_trends(project_id);
create index if not exists day2_topics_project_idx   on public.day2_topics(project_id);
create index if not exists day2_topics_status_idx    on public.day2_topics(status);
create index if not exists day3_content_project_idx  on public.day3_content(project_id);
create index if not exists day3_content_run_idx      on public.day3_content(run_id);
create index if not exists day3_run_nodes_run_idx    on public.day3_run_nodes(run_id);
create index if not exists day4_videos_run_idx       on public.day4_videos(run_id);
create index if not exists day4_videos_content_idx   on public.day4_videos(content_id);

-- ---------- RLS: вимкнено (воркшоп), див. шапку ----------
alter table public.projects        disable row level security;
alter table public.day1_trends     disable row level security;
alter table public.day2_topics     disable row level security;
alter table public.day3_content    disable row level security;
alter table public.day3_runs       disable row level security;
alter table public.day3_run_nodes  disable row level security;
alter table public.day4_videos     disable row level security;
