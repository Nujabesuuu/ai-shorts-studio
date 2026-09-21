-- ============================================================
--  Публічне демо: база лише для читання.
--
--  Проблема: publishable-ключ потрапляє в браузер і в бандл, тож з вимкненим
--  RLS (воркшоп) будь-хто, хто відкрив демо, може стерти чи переписати дані.
--
--  Що робить цей файл: вмикає RLS на всіх таблицях і дозволяє ТІЛЬКИ select.
--  Наслідок: перегляд працює повністю, а форми створення/редагування й кнопки
--  «Затвердити / Відхилити» у демо повернуть помилку доступу — це очікувано.
--
--  Застосовувати ПІСЛЯ міграцій і seed.sql, лише на демо-проєкті.
--  Повернути воркшоп-режим: alter table ... disable row level security.
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'projects', 'day1_trends', 'day2_topics', 'day3_content',
    'day3_runs', 'day3_run_nodes', 'day4_videos'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "demo read %1$s" on public.%1$I', t);
    execute format(
      'create policy "demo read %1$s" on public.%1$I for select to anon, authenticated using (true)',
      t);
  end loop;
end $$;
