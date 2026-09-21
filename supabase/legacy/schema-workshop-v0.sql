-- ============================================================
--  AI Shorts Studio — Case D (Short-Form Video)
--  Supabase / Postgres schema
--  Persists state + results between Dify runs and between days.
--  One row per (project_id, run_id) per day table.
-- ============================================================
--
-- HOW DIFY TALKS TO THIS:
--   The flows use the first-party Supabase plugin (langgenius/supabase):
--     - Create a Row  (table + data JSON)   -> writes
--     - Get Rows      (table + filter + limit) -> reads
--   Set the plugin's auth to your project URL + SERVICE ROLE key (bypasses RLS).
--   NOTE: Get Rows filter is a single 'column=value' with no ordering. To always
--   read the latest, either keep ONE row per project per day (add a unique
--   constraint on project_id and use Update Row on re-runs), or use an HTTP
--   Request node with ?order=created_at.desc&limit=1 instead of the plugin.
--   For a workshop the service key + RLS OFF is simplest; for real use, RLS ON.
-- ============================================================

create extension if not exists "pgcrypto";   -- for gen_random_uuid()

-- ---------- master project ----------
create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  niche       text not null,                  -- e.g. "home barista gear"
  platform    text not null default 'tiktok', -- tiktok | reels | shorts
  status      text not null default 'created',-- created|researched|planned|produced|rendered
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- Day 1: trend research ----------
create table if not exists day1_trends (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  run_id      text not null,                  -- Dify run id or a uuid the flow generates
  niche       text,
  platform    text,
  trends      jsonb not null,                 -- array of trend objects (see data-schemas.json)
  sources     jsonb,                          -- raw web-search citations
  created_at  timestamptz not null default now()
);

-- ---------- Day 2: strategy + approved hooks (HITL) ----------
create table if not exists day2_plan (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  run_id        text not null,
  hook_formats  jsonb not null,               -- 3 recommended hook formats + rationale
  approved      boolean not null default false,
  approved_by   text,                          -- who approved at the HITL gate
  fallback_used boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ---------- Day 3: script + thumbnail assets ----------
create table if not exists day3_assets (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  run_id        text not null,
  script        text not null,                 -- 30s script
  hook_variants jsonb not null,                -- opening hook variants
  shot_hints    jsonb,                         -- optional scene hints for Day 4
  thumbnail_url text,                          -- Nano Banana image (blank unless uploaded to Storage)
  created_at    timestamptz not null default now()
);

-- ---------- Day 4: generated video (knowledge-grounded) ----------
create table if not exists day4_video (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  run_id         text not null,
  shotlist       jsonb not null,               -- per-scene prompts + timing
  video_url      text,                          -- Veo video output URI (needs key header to download)
  voiceover_url  text,                          -- optional TTS output URL
  knowledge_refs jsonb,                         -- which KB chunks grounded the plan
  status         text not null default 'rendered',
  created_at     timestamptz not null default now()
);

-- ---------- helpful indexes ----------
create index if not exists idx_day1_project on day1_trends(project_id, run_id);
create index if not exists idx_day2_project on day2_plan(project_id, run_id);
create index if not exists idx_day3_project on day3_assets(project_id, run_id);
create index if not exists idx_day4_project on day4_video(project_id, run_id);

-- ============================================================
-- OPTIONAL: a single flat "runs" view to inspect a whole pipeline
-- ============================================================
create or replace view pipeline_overview as
select
  p.id              as project_id,
  p.niche,
  p.platform,
  p.status,
  d1.run_id         as research_run,
  d2.approved       as plan_approved,
  d3.thumbnail_url,
  d4.video_url,
  d4.status         as video_status
from projects p
left join day1_trends d1 on d1.project_id = p.id
left join day2_plan   d2 on d2.project_id = p.id
left join day3_assets d3 on d3.project_id = p.id
left join day4_video  d4 on d4.project_id = p.id;

-- ============================================================
-- WORKSHOP MODE (simplest): disable RLS so the service key writes freely
--   (the service key already bypasses RLS, but this makes the anon key
--    work too if students wire that by mistake).
-- ============================================================
alter table projects     disable row level security;
alter table day1_trends  disable row level security;
alter table day2_plan    disable row level security;
alter table day3_assets  disable row level security;
alter table day4_video   disable row level security;

-- ============================================================
-- PRODUCTION MODE (recommended for anything real): keep RLS ON and
-- restrict to the service role. Comment the block above and use this.
-- ------------------------------------------------------------
-- alter table day1_trends enable row level security;
-- create policy "service writes day1" on day1_trends
--   for all to service_role using (true) with check (true);
--   (repeat per table)
-- ============================================================

-- ---------- seed one demo project (the camp advertises itself) ----------
insert into projects (niche, platform, status)
values ('Agentic Orchestration summer camp — promo', 'tiktok', 'created')
on conflict do nothing;
