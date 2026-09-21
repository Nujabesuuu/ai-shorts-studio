-- ============================================================
--  Day 1 TEST DATA (synthetic, УКРАЇНСЬКОЮ) — 2 приклади різних ніш
--  Тренди написані вручну (не з реального пошуку). style у трендах відсутній —
--  він з'являється лише на Дні 2 в hook_formats.
--
--  Фіксовані project_id — встав у Start Дня 2:
--    11111111-1111-1111-1111-111111111111  (Домашня кава та бариста-гаджети · tiktok)
--    22222222-2222-2222-2222-222222222222  (Бюджетні подорожі Україною · reels)
--  Ідемпотентно: можна перезапускати.
-- ============================================================
begin;

-- ---- Домашня кава та бариста-гаджети ----
insert into projects (id, niche, platform, status)
values ('11111111-1111-1111-1111-111111111111', $$Домашня кава та бариста-гаджети$$, 'tiktok', 'researched')
on conflict (id) do update set status = excluded.status,
                               niche = excluded.niche,
                               platform = excluded.platform;

delete from day1_trends where project_id = '11111111-1111-1111-1111-111111111111';

insert into day1_trends (project_id, run_id, niche, platform, trends, sources)
values (
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111-d1',
  $$Домашня кава та бариста-гаджети$$,
  'tiktok',
  $$[
  {
    "format_name": "POV: перша чашка вранці",
    "why_it_works": "ASMR-приготування кави від першої особи занурює глядача в ритуал і викликає бажання повторити — сильний емоційний гачок у перші секунди.",
    "example_topic": "POV: ти прокидаєшся й готуєш ідеальний флет-вайт удома",
    "avg_length_sec": 20,
    "source_url": "https://www.tiktok.com/tag/coffeetok"
  },
  {
    "format_name": "3 помилки початківців (listicle)",
    "why_it_works": "Нумерований список помилок грає на страху зробити не так; легко переглядається й провокує зберігати відео.",
    "example_topic": "3 причини, чому твоя домашня кава гірчить",
    "avg_length_sec": 28,
    "source_url": "https://www.tiktok.com/tag/homebarista"
  },
  {
    "format_name": "До/після: апгрейд кавомашини",
    "why_it_works": "Контраст «було/стало» дає миттєвий візуальний результат і зупиняє скрол.",
    "example_topic": "Дешева турка проти домашньої еспресо-машини",
    "avg_length_sec": 22,
    "source_url": "https://www.instagram.com/reels/"
  },
  {
    "format_name": "Розвінчання міфів (talking head)",
    "why_it_works": "Пряме заперечення поширеної думки провокує коментарі й суперечки, що піднімає охоплення.",
    "example_topic": "Ні, дорога кавомашина не робить каву смачнішою автоматично",
    "avg_length_sec": 33,
    "source_url": "https://www.youtube.com/results?search_query=coffee+myths"
  },
  {
    "format_name": "Спідран: лате-арт за 30 секунд",
    "why_it_works": "Швидкий таймлапс із красивим фіналом дає відчуття задоволення й демонструє навичку наочно.",
    "example_topic": "Виливаю ідеальне серце на лате з першої спроби",
    "avg_length_sec": 30,
    "source_url": "https://www.tiktok.com/tag/latteart"
  }
]$$::jsonb,
  $$["https://www.tiktok.com/tag/coffeetok", "https://www.tiktok.com/tag/homebarista", "https://www.instagram.com/reels/", "https://www.youtube.com/results?search_query=coffee+myths", "https://www.tiktok.com/tag/latteart"]$$::jsonb
);

-- ---- Бюджетні подорожі Україною ----
insert into projects (id, niche, platform, status)
values ('22222222-2222-2222-2222-222222222222', $$Бюджетні подорожі Україною$$, 'reels', 'researched')
on conflict (id) do update set status = excluded.status,
                               niche = excluded.niche,
                               platform = excluded.platform;

delete from day1_trends where project_id = '22222222-2222-2222-2222-222222222222';

insert into day1_trends (project_id, run_id, niche, platform, trends, sources)
values (
  '22222222-2222-2222-2222-222222222222',
  '22222222-2222-2222-2222-222222222222-d1',
  $$Бюджетні подорожі Україною$$,
  'reels',
  $$[
  {
    "format_name": "POV: вихідні за мінімум грошей",
    "why_it_works": "Формат «скільки коштує» від першої особи тримає інтригу до фіналу й дає конкретну користь глядачу.",
    "example_topic": "POV: скільки насправді коштує вихідний у Львові",
    "avg_length_sec": 25,
    "source_url": "https://www.instagram.com/reels/"
  },
  {
    "format_name": "5 локацій, про які не знають туристи (listicle)",
    "why_it_works": "Списки «прихованих місць» дають відчуття інсайдерського знання й активно репостяться.",
    "example_topic": "5 недооцінених міст України для короткої відпустки",
    "avg_length_sec": 32,
    "source_url": "https://www.tiktok.com/tag/travelukraine"
  },
  {
    "format_name": "До/після: маршрут за 1000 грн",
    "why_it_works": "Чіткий бюджетний челендж із результатом наприкінці дає сильний гачок і практичну цінність.",
    "example_topic": "Ціла подорож на вихідні за 1000 грн — реально?",
    "avg_length_sec": 27,
    "source_url": "https://www.youtube.com/results?search_query=budget+travel"
  },
  {
    "format_name": "Розвінчання: подорожувати дорого?",
    "why_it_works": "Заперечення поширеного переконання зачіпає й запускає дискусію в коментарях.",
    "example_topic": "Ні, подорожувати Україною не дорого — ось доказ",
    "avg_length_sec": 30,
    "source_url": "https://www.instagram.com/reels/"
  },
  {
    "format_name": "Спідран: зібрати рюкзак за 60 секунд",
    "why_it_works": "Швидкий таймлапс збору речей практичний і задовольняє, спонукає додивитися до кінця.",
    "example_topic": "Пакую все на вихідні в один рюкзак",
    "avg_length_sec": 40,
    "source_url": "https://www.tiktok.com/tag/packing"
  }
]$$::jsonb,
  $$["https://www.instagram.com/reels/", "https://www.tiktok.com/tag/travelukraine", "https://www.youtube.com/results?search_query=budget+travel", "https://www.instagram.com/reels/", "https://www.tiktok.com/tag/packing"]$$::jsonb
);

commit;

-- перевірка:
-- select project_id, niche, jsonb_array_length(trends) n from day1_trends
--  where project_id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
