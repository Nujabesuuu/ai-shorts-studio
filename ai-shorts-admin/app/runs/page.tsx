import { createClient } from "@/lib/supabase";
import { EmptyState, PageHeader, Section } from "@/components/ui";
import {
  FLOW_VERSIONS,
  RUBRIC,
  TONE_TEXT,
  flowVersionBadge,
  formatDateTime,
  num,
  plural,
  scoreTone,
  type Day3Run,
  type Day3RunNode,
} from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Прогони та оптимізація — AI Shorts Studio" };

/** Ціль за ТЗ: сумарні токени фіналу не більші за 70 % від baseline. */
const TOKEN_GOAL = 0.7;

/**
 * Медіана, а не середнє. Один викид на трьох прогонах зсуває середнє
 * настільки, що дельта −30 % перестає щось означати.
 */
function median(values: number[]): number | null {
  const xs = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

function pct(from: number | null, to: number | null): number | null {
  if (from == null || to == null || from === 0) return null;
  return ((to - from) / from) * 100;
}

function fmt(n: number | null, digits = 0): string {
  if (n == null) return "—";
  return n.toLocaleString("uk-UA", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Дельта, підфарбована за напрямком: для токенів і часу менше — краще. */
function Delta({
  value,
  lowerIsBetter = true,
  digits = 1,
}: {
  value: number | null;
  lowerIsBetter?: boolean;
  digits?: number;
}) {
  if (value == null) return <span className="mono text-[12px] text-lo">—</span>;
  const good = lowerIsBetter ? value < 0 : value > 0;
  const neutral = Math.abs(value) < 0.05;
  const cls = neutral ? "text-lo" : good ? "text-emerald" : "text-rose";
  return (
    <span className={`mono text-[12px] tabular-nums ${cls}`}>
      {value > 0 ? "+" : ""}
      {value.toFixed(digits)}%
    </span>
  );
}

type Agg = {
  version: string;
  runs: Day3Run[];
  tokens: number | null;
  elapsed: number | null;
  quality: number | null;
  items: number | null;
  repaired: number | null;
  byCriterion: Record<string, number | null>;
};

function aggregate(version: string, runs: Day3Run[]): Agg {
  const ok = runs.filter((r) => r.flow_version === version);
  const byCriterion: Record<string, number | null> = {};
  for (const c of RUBRIC) {
    byCriterion[c.key] = median(
      ok
        .map((r) => num(r.by_criterion?.[c.key] as number | undefined))
        .filter((n): n is number => n != null),
    );
  }
  return {
    version,
    runs: ok,
    tokens: median(ok.map((r) => num(r.total_tokens)).filter((n): n is number => n != null)),
    elapsed: median(ok.map((r) => num(r.elapsed_sec)).filter((n): n is number => n != null)),
    quality: median(ok.map((r) => num(r.avg_quality)).filter((n): n is number => n != null)),
    items: median(ok.map((r) => num(r.items_produced)).filter((n): n is number => n != null)),
    repaired: median(ok.map((r) => num(r.items_repaired)).filter((n): n is number => n != null)),
    byCriterion,
  };
}

export default async function RunsPage() {
  const supabase = createClient();

  const [runsRes, nodesRes] = await Promise.all([
    supabase
      .from("day3_runs")
      .select("*")
      .order("created_at", { ascending: true })
      .returns<Day3Run[]>(),
    supabase
      .from("day3_run_nodes")
      .select("*")
      .order("seq", { ascending: true })
      .returns<Day3RunNode[]>(),
  ]);

  if (runsRes.error) throw new Error(runsRes.error.message);
  if (nodesRes.error) throw new Error(nodesRes.error.message);

  const runs = runsRes.data ?? [];
  const nodes = nodesRes.data ?? [];

  const aggs = FLOW_VERSIONS.map((v) => aggregate(v, runs)).filter((a) => a.runs.length > 0);
  const base = aggs.find((a) => a.version === "baseline") ?? null;
  const last = aggs.length ? aggs[aggs.length - 1] : null;
  const final = aggs.find((a) => a.version === "final") ?? last;

  const tokenDelta = pct(base?.tokens ?? null, final?.tokens ?? null);
  const timeDelta = pct(base?.elapsed ?? null, final?.elapsed ?? null);
  const qualityDelta = pct(base?.quality ?? null, final?.quality ?? null);

  const tokenGoalMet =
    base?.tokens != null && final?.tokens != null && final.tokens <= base.tokens * TOKEN_GOAL;

  const qualityHeld =
    base && final
      ? RUBRIC.every((c) => {
          const b = base.byCriterion[c.key];
          const f = final.byCriterion[c.key];
          return b == null || f == null || f >= b;
        })
      : false;

  const accepted = tokenGoalMet && qualityHeld;

  // Токени по нодах для найсвіжішого прогону кожної конфігурації —
  // саме тут видно, яка нода з'їдає бюджет.
  const latestByVersion = new Map<string, Day3Run>();
  for (const r of runs) latestByVersion.set(r.flow_version, r);
  const nodeRows = (runId: string) => nodes.filter((n) => n.run_id === runId);

  if (runs.length === 0) {
    return (
      <>
        <PageHeader
          eyebrow="benchmark · day3_runs"
          title="Прогони та оптимізація"
          subtitle="Таблиця «до/після» рахується з реальних цифр Dify, а не заповнюється руками."
        />
        <EmptyState
          title="Прогонів ще немає"
          hint="Запустіть baseline і фінал через scripts/bench.mjs — він тягне total_tokens та elapsed_time з Dify API і складає їх у day3_runs. Таблиця нижче збереться сама."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="benchmark · day3_runs"
        title="Прогони та оптимізація"
        subtitle="Медіана по прогонах кожної конфігурації. Джерело цифр — Dify API, не ручні оцінки."
      />

      {/* ── Вердикт за трьома осями ТЗ */}
      <div className="rise mb-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card relative overflow-hidden p-5">
          <span
            className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent ${
              tokenGoalMet ? "via-emerald" : "via-amber"
            } opacity-80`}
          />
          <p className="eyebrow">токени · ціль −30%</p>
          <p
            className={`display mt-3 text-[34px] leading-none tabular-nums ${
              tokenGoalMet ? "text-emerald" : "text-amber"
            }`}
          >
            {tokenDelta == null ? "—" : `${tokenDelta > 0 ? "+" : ""}${tokenDelta.toFixed(1)}%`}
          </p>
          <p className="mono mt-2 text-[11px] text-lo">
            {fmt(base?.tokens ?? null)} → {fmt(final?.tokens ?? null)}
          </p>
        </div>

        <div className="card p-5">
          <p className="eyebrow">час end-to-end</p>
          <p className="display mt-3 text-[34px] leading-none tabular-nums text-hi">
            {timeDelta == null ? "—" : `${timeDelta > 0 ? "+" : ""}${timeDelta.toFixed(1)}%`}
          </p>
          <p className="mono mt-2 text-[11px] text-lo">
            {fmt(base?.elapsed ?? null, 1)} с → {fmt(final?.elapsed ?? null, 1)} с
          </p>
        </div>

        <div className="card p-5">
          <p className="eyebrow">середній бал якості</p>
          <p
            className={`display mt-3 text-[34px] leading-none tabular-nums ${
              TONE_TEXT[scoreTone(final?.quality ?? null)]
            }`}
          >
            {fmt(final?.quality ?? null, 1)}
          </p>
          <p className="mono mt-2 text-[11px] text-lo">
            baseline {fmt(base?.quality ?? null, 1)} ·{" "}
            <Delta value={qualityDelta} lowerIsBetter={false} />
          </p>
        </div>

        <div className="card p-5">
          <p className="eyebrow">критерій прийняття</p>
          <p
            className={`display mt-3 text-[20px] leading-tight ${
              accepted ? "text-emerald" : "text-amber"
            }`}
          >
            {accepted ? "Зараховано" : "Ще не взято"}
          </p>
          <p className="mono mt-2 text-[11px] leading-relaxed text-lo">
            токени {tokenGoalMet ? "✓" : "✗"} · якість по кожному критерію{" "}
            {qualityHeld ? "✓" : "✗"}
          </p>
        </div>
      </div>

      {/* ── Таблиця «до/після» */}
      <Section
        index="01"
        title="До / після по конфігураціях"
        meta="медіана · дельта рахується від baseline"
        delay={60}
      >
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Конфігурація</th>
                  <th>Прогонів</th>
                  <th>Токени</th>
                  <th>Δ токенів</th>
                  <th>Час, с</th>
                  <th>Δ часу</th>
                  <th>Бал</th>
                  <th>Одиниць</th>
                  <th>З ремонтом</th>
                </tr>
              </thead>
              <tbody>
                {aggs.map((a) => (
                  <tr key={a.version}>
                    <td>
                      <span className={`badge ${flowVersionBadge(a.version)}`}>
                        {a.version}
                      </span>
                    </td>
                    <td className="mono text-[12.5px] text-mid">{a.runs.length}</td>
                    <td className="mono tabular-nums text-[13.5px] text-hi">
                      {fmt(a.tokens)}
                    </td>
                    <td>
                      {a.version === "baseline" ? (
                        <span className="mono text-[12px] text-lo">точка відліку</span>
                      ) : (
                        <Delta value={pct(base?.tokens ?? null, a.tokens)} />
                      )}
                    </td>
                    <td className="mono tabular-nums text-[13.5px] text-hi">
                      {fmt(a.elapsed, 1)}
                    </td>
                    <td>
                      {a.version === "baseline" ? (
                        <span className="mono text-[12px] text-lo">—</span>
                      ) : (
                        <Delta value={pct(base?.elapsed ?? null, a.elapsed)} />
                      )}
                    </td>
                    <td
                      className={`mono tabular-nums text-[13.5px] ${
                        TONE_TEXT[scoreTone(a.quality)]
                      }`}
                    >
                      {fmt(a.quality, 1)}
                    </td>
                    <td className="mono text-[12.5px] text-mid">{fmt(a.items)}</td>
                    <td className="mono text-[12.5px] text-mid">{fmt(a.repaired)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* ── Якість по критеріях: фінал не має просісти ніде */}
      <div className="mt-9">
        <Section
          index="02"
          title="Якість покритерійно"
          meta="фінал не гірший за baseline по кожному критерію"
          delay={120}
        >
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Критерій</th>
                    <th>Вага</th>
                    {aggs.map((a) => (
                      <th key={a.version}>{a.version}</th>
                    ))}
                    <th>Δ фінал</th>
                  </tr>
                </thead>
                <tbody>
                  {RUBRIC.map((c) => {
                    const b = base?.byCriterion[c.key] ?? null;
                    const f = final?.byCriterion[c.key] ?? null;
                    const held = b == null || f == null || f >= b;
                    return (
                      <tr key={c.key}>
                        <td>
                          <span className="text-[13.5px] font-medium text-hi">
                            {c.label}
                          </span>
                          <p className="mt-1 max-w-[340px] text-[12px] leading-snug text-lo">
                            {c.hint}
                          </p>
                        </td>
                        <td className="mono text-[12px] text-lo">×{c.weight}</td>
                        {aggs.map((a) => (
                          <td
                            key={a.version}
                            className={`mono tabular-nums text-[13.5px] ${
                              TONE_TEXT[scoreTone(a.byCriterion[c.key])]
                            }`}
                          >
                            {fmt(a.byCriterion[c.key], 1)}
                          </td>
                        ))}
                        <td>
                          <span
                            className={`badge ${held ? "badge-emerald" : "badge-rose"}`}
                          >
                            {held ? "тримає" : "просів"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      </div>

      {/* ── Розклад по нодах */}
      {nodes.length > 0 && (
        <div className="mt-9">
          <Section
            index="03"
            title="Токени по нодах"
            meta="найсвіжіший прогін кожної конфігурації"
            delay={180}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              {[...latestByVersion.entries()].map(([version, run]) => {
                const rows = nodeRows(run.id);
                if (!rows.length) return null;
                const max = Math.max(...rows.map((n) => num(n.total_tokens) ?? 0), 1);
                return (
                  <div key={version} className="card p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <span className={`badge ${flowVersionBadge(version)}`}>{version}</span>
                      <span className="mono text-[11px] text-lo">
                        {fmt(num(run.total_tokens))} токенів ·{" "}
                        {fmt(num(run.elapsed_sec), 1)} с
                      </span>
                    </div>
                    <ul className="space-y-3">
                      {rows.map((n) => {
                        const t = num(n.total_tokens) ?? 0;
                        return (
                          <li key={n.id}>
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="truncate text-[13px] text-mid">
                                {n.node_title ?? n.node_id ?? "—"}
                              </span>
                              <span className="mono shrink-0 text-[12px] tabular-nums text-hi">
                                {t ? fmt(t) : "—"}
                              </span>
                            </div>
                            <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-surface-2">
                              <div
                                className="h-full rounded-full bg-accent"
                                style={{ width: `${(t / max) * 100}%` }}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>
      )}

      {/* ── Журнал прогонів */}
      <div className="mt-9">
        <Section
          index="04"
          title="Журнал прогонів"
          meta={`${runs.length} ${plural(runs.length, "прогін", "прогони", "прогонів")}`}
          delay={240}
        >
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Конфігурація</th>
                    <th>Спроба</th>
                    <th>Токени</th>
                    <th>Час, с</th>
                    <th>Одиниць</th>
                    <th>Бал</th>
                    <th>Статус</th>
                    <th>Коли</th>
                  </tr>
                </thead>
                <tbody>
                  {[...runs].reverse().map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className={`badge ${flowVersionBadge(r.flow_version)}`}>
                          {r.flow_version}
                        </span>
                        {r.label && (
                          <p className="mt-1 max-w-[280px] text-[12px] leading-snug text-lo">
                            {r.label}
                          </p>
                        )}
                      </td>
                      <td className="mono text-[12.5px] text-mid">#{r.attempt}</td>
                      <td className="mono tabular-nums text-[13px] text-hi">
                        {fmt(num(r.total_tokens))}
                      </td>
                      <td className="mono tabular-nums text-[13px] text-hi">
                        {fmt(num(r.elapsed_sec), 1)}
                      </td>
                      <td className="mono text-[12.5px] text-mid">
                        {r.items_produced ?? "—"}
                        {r.items_repaired ? (
                          <span className="text-lo"> / {r.items_repaired} рем.</span>
                        ) : null}
                      </td>
                      <td
                        className={`mono tabular-nums text-[13px] ${
                          TONE_TEXT[scoreTone(num(r.avg_quality))]
                        }`}
                      >
                        {fmt(num(r.avg_quality), 1)}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            r.status === "succeeded"
                              ? "badge-emerald"
                              : r.status === "partial"
                                ? "badge-amber"
                                : "badge-rose"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="mono whitespace-nowrap text-[12px] text-lo">
                        {formatDateTime(r.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      </div>
    </>
  );
}
