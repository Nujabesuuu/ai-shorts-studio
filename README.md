# AI Shorts Studio — адмін-панель

Панель керування пайплайном коротких відео: ніші → тренди Day 1 → теми Day 2 з ручним
затвердженням → готовий до публікації контент Day 3.
Дані живуть у Supabase, пишуться туди Dify-флоу, а панель дає їх переглядати й редагувати руками.

Здача Day 3 (декомпозиція, DSL, таблиця «до/після», рефлексія) — у [DELIVERY.md](DELIVERY.md).

**Стек:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 · Supabase JS v2

---

## Швидкий старт

Потрібен **Node.js 20.9+** (перевірити: `node -v`) і безкоштовний проєкт на [Supabase](https://supabase.com).

```bash
cd ai-shorts-admin
cp .env.example .env.local      # впишіть URL і publishable-ключ свого Supabase
npm install && npm run dev
```

Відкрити http://localhost:3000

**База даних.** У Supabase → SQL Editor виконайте по черзі
[`supabase/migrations/20260921000000_init.sql`](supabase/migrations/20260921000000_init.sql) і
[`supabase/seed.sql`](supabase/seed.sql). Сід містить синтетичні демо-дані: два проєкти, повний
ланцюг Day 1–4 і три прогони бенчмарку. Деталі — в [`supabase/README.md`](supabase/README.md).

Ключі: **Supabase → Settings → API Keys** (потрібен саме *publishable*, не service role).
Після зміни `.env.local` перезапустіть `npm run dev` — Next читає env лише на старті.

## Команди

| Команда | Що робить |
|---|---|
| `npm run dev` | dev-сервер на :3000 |
| `npm run build` | продакшн-збірка |
| `npm start` | запуск продакшн-збірки (спершу `build`) |
| `npm run lint` | ESLint |
| `npm run bench -- --all --runs 3` | прогони флоу Day 3 через Dify API + запис метрик у `day3_runs` |
| `npm run bot` | Telegram-міст: бот-тригер флоу (`/gen`) |
| `npm run dsl` | перегенерувати й перевірити Dify DSL |
| `npx tsc --noEmit` | перевірка типів |

> ⚠️ Не запускай `npm run build`, поки працює `npm run dev` — вони ділять теку `.next`, і HMR після цього ламається (CSS перестає перекомпільовуватись). Якщо таке сталося: зупини сервер, видали `.next`, запусти `npm run dev` знову.

## Структура БД

Панель працює з шістьма таблицями (RLS вимкнено — workshop-режим, окремий логін не потрібен):

```
projects        id · niche · created_at
   │
   ├── day1_trends   project_id · run_id · niche · platform · title ·
   │                 description · hook_idea · format · hashtags[] · created_at
   │                     ▲   ▲
   ├── day2_topics   project_id · run_id · niche · platform · title · text ·
   │                 source_trend_id ─┘   │ · status · created_at
   │                     ▲                │
   └── day3_content  project_id · topic_id ┘ · source_trend_id ┘ · run_id ·
                     format(reels|carousel|stories) · title · hook · hook_alt ·
                     script(jsonb) · onscreen_text · caption · hashtags[] · cta ·
                     duration_sec · quality(jsonb) · quality_score · repaired ·
                     status(ready|needs_review|rejected) · model · flow_version

day3_runs       бенчмарк прогонів: flow_version · attempt · total_tokens ·
   │            elapsed_sec · items_produced · avg_quality · by_criterion(jsonb)
   └── day3_run_nodes   розклад токенів і часу по нодах одного прогону
```

Особливості, які варто знати:

- **Один тренд = один рядок** у `day1_trends` (не jsonb-масив).
- `run_id` можна лишати порожнім — спрацює `gen_random_uuid()` на боці БД.
- `hashtags` — це `text[]`; у формі вводяться рядком через пробіл/кому й конвертуються автоматично.
- `day1_trends` видаляються **каскадом** разом із проєктом, а `day2_topics` — ні, тому панель знімає їх сама.
- Тренд, на який посилається тема Day 2, видалити не можна — панель покаже зрозуміле повідомлення замість помилки.
- `text` і `description` рендеряться як **markdown** (жирний, списки, посилання).

## Маршрути

| Шлях | Що там |
|---|---|
| `/` | дашборд: метрики, розподіл за платформами, активність, таблиця проєктів |
| `/projects/new`, `/projects/[id]/edit` | створення / редагування ніші |
| `/projects/[id]` | картка проєкту: тренди Day 1, теми Day 2, HITL-кнопки |
| `/projects/[id]/day1/new`, `/day1/[recordId]/edit` | CRUD трендів |
| `/projects/[id]/day2/new`, `/day2/[recordId]/edit` | CRUD тем |
| `/trends`, `/topics` | глобальні реєстри з пошуком по всіх проєктах |
| `/content` | реєстр Day 3: фільтри за форматом і статусом, пошук |
| `/content/[id]` | картка контенту: розкадровка з таймкодами, A/B-хуки, рубрика з доказами, ланцюг тренд → тема → контент |
| `/projects/[id]/day3/new`, `/day3/[recordId]/edit` | CRUD контенту |
| `/runs` | бенчмарк прогонів: таблиця «до/після», токени по нодах, покритерійна якість |

## HITL-гейт (Day 2)

**HITL** = *Human-in-the-Loop*, «людина в контурі». Це точка в автоматичному пайплайні, де
робота зупиняється й чекає рішення людини, замість того щоб їхати далі самотужки.

Навіщо: модель генерує теми пачками й іноді видає нерелевантне, юридично ризиковане або
просто нудне. Дешевше відсіяти це на етапі теми (рядок тексту), ніж після зйомки відео.

Як це влаштовано тут: колонка `day2_topics.status`.

| Статус | Значення |
|---|---|
| `draft` | чернетка, ще не на розгляді |
| `pending` | **чекає на рішення людини** — це і є гейт |
| `approved` | затверджено, можна брати в роботу |
| `rejected` | відхилено |

На картці проєкту в кожної теми є кнопки **Затвердити / Відхилити / Повернути на розгляд** —
вони міняють `status` через Server Action. На дашборді є окремий блок «Чекають на гейт»,
щоб не шукати незатверджене вручну, і лічильник «Затверджено N з M».

## Структура коду

```
admin-panel-2/
├── dify/
│   ├── build_dsl.py          генератор DSL: baseline і final зі спільного джерела
│   ├── validate_dsl.py       перевірка графа, посилань, схем, секретів
│   ├── test_code_nodes.py    прогін python-нод локально на справжніх даних
│   ├── config.py             ключі з env / .env.local (у коді їх немає)
│   └── *.public.yml          артефакти на здачу (без секретів)
├── docs/specs/               дизайн-спека Day 3
├── supabase/                 міграція, демо-сід, політики read-only
├── DELIVERY.md               здача: декомпозиція, «до/після», рефлексія
└── ai-shorts-admin/
    ├── app/
    │   ├── page.tsx              дашборд
    │   ├── layout.tsx            шрифти + оболонка
    │   ├── globals.css           дизайн-система (токени, компоненти, markdown)
    │   ├── actions/              Server Actions: projects.ts, day1.ts, day2.ts, day3.ts
    │   ├── projects/             CRUD-сторінки
    │   ├── trends/, topics/      глобальні реєстри Day 1 / Day 2
    │   ├── content/              реєстр і картка контенту Day 3
    │   ├── runs/                 бенчмарк прогонів
    │   └── error.tsx, not-found.tsx, loading.tsx
    ├── components/           Sidebar, ui.tsx, форми, Markdown, DeleteButton,
    │                         ScriptTimeline (розкадровка), Rubric (бали з доказами)
    ├── scripts/              bench.mjs (метрики з Dify API), telegram-bot.mjs, lib.mjs
    └── lib/
        ├── supabase.ts       createClient()
        ├── db.ts             типи таблиць, рубрика, бейджі, форматування
        └── form-state.ts     спільний тип стану форм
```

Валідація й запис — у Server Actions; сторінки лишаються Server Components і читають БД напряму.
Форми — клієнтські лише через `useActionState` (щоб показувати помилки без перезавантаження).

## Деплой на Vercel

1. Імпортувати репозиторій, **Root Directory** → `ai-shorts-admin`.
2. Додати ті самі дві env-змінні.
3. Deploy.

## Безпека

RLS вимкнено на **всіх шести** таблицях — будь-хто з publishable-ключем може читати й
змінювати всі рядки. Для воркшопу так і задумано. Для чогось реального треба вмикати RLS
**разом із політиками** (без політик доступ відріже повністю) і додавати логін через
Supabase Auth.

```sql
alter table public.projects      enable row level security;
alter table public.day1_trends   enable row level security;
alter table public.day2_topics   enable row level security;
alter table public.day3_content  enable row level security;
alter table public.day3_runs     enable row level security;
alter table public.day3_run_nodes enable row level security;
-- + політики під потрібну роль
```

Секрети (Telegram-токен, ключі Dify і Supabase) лежать у `ai-shorts-admin/.env.local` (шаблон —
`.env.example`) і в `environment_variables` Dify. У репозиторії їх немає: генератори DSL
читають значення з env або з `.env.local` (`dify/config.py`). У `dify/*.public.yml` змінні
порожні, а `chat_id` замінено заглушкою `YOUR_TELEGRAM_CHAT_ID` — заповніть їх у Dify Studio
після імпорту. Версії з підставленими ключами (`dify/*.yml` без `.public`) у `.gitignore`.

Для публічного демо застосуйте `supabase/policies_demo_readonly.sql` (база лише для читання)
і виставте `NEXT_PUBLIC_DEMO_MODE=true` — у шапці зʼявиться плашка «лише перегляд».
