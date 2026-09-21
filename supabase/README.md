# База даних

| Файл | Що це |
|---|---|
| `migrations/20260921000000_init.sql` | повна схема: 7 таблиць пайплайну (проєкти → тренди → теми → контент → відео + бенчмарк) |
| `seed.sql` | демо-дані: добірка з реального прогону курсу (3 проєкти, 4 відео, тренди, теми, контент, 4 прогони бенчмарку) |
| `policies_demo_readonly.sql` | RLS «лише читання» для публічного демо |
| `legacy/` | схема з першого дня воркшопу — **не відповідає** поточному застосунку, лишена для історії |

Схема відновлена з коду адмінки (`ai-shorts-admin/lib/db.ts`, Server Actions) і Dify-флоу,
а не зроблена `pg_dump`-ом. Якщо змінюєте колонку в коді, додайте нову міграцію.

## Підняти власну базу

1. Створіть проєкт на [supabase.com](https://supabase.com) (окремий, не робочий).
2. **SQL Editor** → вставте й виконайте по черзі:
   `migrations/20260921000000_init.sql`, потім `seed.sql`.
3. **Project Settings → API**: скопіюйте URL і **publishable**-ключ (не service role) у
   `ai-shorts-admin/.env.local` (шаблон — `ai-shorts-admin/.env.example`).
4. Перезапустіть `npm run dev`.

`seed.sql` можна запускати повторно: він нічого не перезаписує (`on conflict do nothing`).
Демо-відео лежать у `ai-shorts-admin/public/demo/videos/` (стиснуті mp4, ~2 МБ кожне), тож Storage не потрібен.

## Публічний деплой

Publishable-ключ потрапляє в браузер. З вимкненим RLS (режим воркшопу) будь-який
відвідувач зможе стерти чи переписати дані. Для публічного демо після seed виконайте
`policies_demo_readonly.sql`.

Що зміниться: перегляд працює повністю; форми й кнопки «Затвердити / Відхилити» нічого
не запишуть. `insert` дає помилку RLS, а `update` і `delete` **мовчки** зачіпають 0 рядків.
Щоб повернути режим запису: `alter table public.<таблиця> disable row level security`.

## Ключі для Dify-флоу

Генератори DSL (`dify/build_dsl*.py`, `npm run dsl`) не містять секретів. Вони читають
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` зі змінних середовища або з
`ai-shorts-admin/.env.local` (див. `dify/config.py`).

- `dify/*.public.yml` — без секретів, ідуть у репозиторій. `chat_id` у них — заглушка
  `YOUR_TELEGRAM_CHAT_ID`, а змінні `SUPABASE_*` і `TELEGRAM_*` порожні: заповніть їх у
  Dify Studio → Environment Variables після імпорту.
- `dify/*.yml` (без `.public`) — з вашими ключами, у `.gitignore`.
