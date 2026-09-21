import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { PageHeader, Section, Hashtags } from "@/components/ui";
import ScriptTimeline from "@/components/ScriptTimeline";
import Rubric from "@/components/Rubric";
import Markdown from "@/components/Markdown";
import DeleteButton from "@/components/DeleteButton";
import { deleteContent, setContentStatus } from "@/app/actions/day3";
import { generateVideo } from "@/app/actions/day4";
import {
  TONE_TEXT,
  clock,
  contentStatusBadge,
  contentStatusLabel,
  flowVersionBadge,
  formatBadge,
  formatDateTime,
  num,
  parseScript,
  platformBadge,
  plural,
  scoreTone,
  shortId,
  type Day3Content,
} from "@/lib/db";

export const dynamic = "force-dynamic";

type Row = Day3Content & { projects: { id: string; niche: string } | null };

/** Ланка ланцюга простежуваності: тренд → тема → контент. */
function ChainLink({
  step,
  label,
  title,
  href,
  muted,
}: {
  step: string;
  label: string;
  title: string;
  href?: string;
  muted?: boolean;
}) {
  const body = (
    <div
      className={`card ${href ? "card-hover" : ""} h-full px-4 py-3.5 ${
        muted ? "opacity-55" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="mono text-[10px] tracking-[0.16em] text-accent">{step}</span>
        <span className="eyebrow">{label}</span>
      </div>
      <p
        className={`mt-2 line-clamp-2 text-[13px] leading-snug ${
          muted ? "text-lo" : "text-hi"
        }`}
      >
        {title}
      </p>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function Block({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="eyebrow mb-2.5">{label}</p>
      {children}
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createClient();
  const { data } = await supabase
    .from("day3_content")
    .select("title")
    .eq("id", id)
    .maybeSingle();
  return { title: `${data?.title ?? "Контент"} — AI Shorts Studio` };
}

export default async function ContentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createClient();

  const { data, error } = await supabase
    .from("day3_content")
    .select("*, projects(id, niche)")
    .eq("id", id)
    .maybeSingle<Row>();

  if (error) throw new Error(error.message);
  if (!data) notFound();

  const [topicRes, trendRes] = await Promise.all([
    data.topic_id
      ? supabase.from("day2_topics").select("id, title").eq("id", data.topic_id).maybeSingle()
      : Promise.resolve({ data: null }),
    data.source_trend_id
      ? supabase.from("day1_trends").select("id, title").eq("id", data.source_trend_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const topic = topicRes.data as { id: string; title: string } | null;
  const trend = trendRes.data as { id: string; title: string } | null;

  const projectId = data.project_id ?? "";
  const score = num(data.quality_score);
  const frames = parseScript(data.script);
  const tone = scoreTone(score);

  const promote = data.status !== "ready"
    ? setContentStatus.bind(null, projectId, data.id, "ready")
    : null;
  const reject = data.status !== "rejected"
    ? setContentStatus.bind(null, projectId, data.id, "rejected")
    : null;

  return (
    <>
      <PageHeader
        eyebrow={`day 3 · ${data.format}`}
        title={data.title}
        backHref="/content"
        subtitle={
          <div className="flex flex-wrap items-center gap-2">
            <span className={`badge badge-dot ${formatBadge(data.format)}`}>
              {data.format}
            </span>
            {data.platform && (
              <span className={`badge badge-dot ${platformBadge(data.platform)}`}>
                {data.platform}
              </span>
            )}
            <span className={`badge ${contentStatusBadge(data.status)}`}>
              {contentStatusLabel(data.status)}
            </span>
            {data.flow_version && (
              <span className={`badge ${flowVersionBadge(data.flow_version)}`}>
                {data.flow_version}
              </span>
            )}
            {data.repaired && <span className="badge badge-neutral">після ремонту</span>}
          </div>
        }
        actions={
          projectId ? (
            <Link
              href={`/projects/${projectId}/day3/${data.id}/edit`}
              className="btn btn-ghost"
            >
              Редагувати
            </Link>
          ) : undefined
        }
      />

      {/* Ланцюг простежуваності — головний доказ, що це не контент з повітря */}
      <div className="rise mb-9 grid gap-3 sm:grid-cols-3">
        <ChainLink
          step="01"
          label="тренд · day 1"
          title={trend?.title ?? "не привʼязано"}
          href={trend && projectId ? `/projects/${projectId}/day1/${trend.id}/edit` : undefined}
          muted={!trend}
        />
        <ChainLink
          step="02"
          label="тема · day 2"
          title={topic?.title ?? "не привʼязано"}
          href={topic && projectId ? `/projects/${projectId}/day2/${topic.id}/edit` : undefined}
          muted={!topic}
        />
        <ChainLink step="03" label="контент · day 3" title={data.title} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Section
            index="01"
            title="Хук"
            meta="перші 0-3 секунди · два варіанти на A/B"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="card p-5">
                <p className="eyebrow mb-2.5 text-accent">варіант A</p>
                <p className="text-[15px] leading-relaxed text-hi">
                  {data.hook || "—"}
                </p>
              </div>
              <div className="card p-5">
                <p className="eyebrow mb-2.5">варіант B</p>
                <p className="text-[15px] leading-relaxed text-mid">
                  {data.hook_alt || "—"}
                </p>
              </div>
            </div>
          </Section>

          <Section
            index="02"
            title={data.format === "carousel" ? "Слайди" : "Розкадровка"}
            meta={`${frames.length} ${
              data.format === "carousel"
                ? plural(frames.length, "слайд", "слайди", "слайдів")
                : plural(frames.length, "кадр", "кадри", "кадрів")
            }${data.duration_sec ? ` · ${clock(data.duration_sec)}` : ""}`}
          >
            <div className="card p-6">
              <ScriptTimeline script={data.script} format={data.format} />
            </div>
          </Section>

          <Section index="03" title="Публікація">
            <div className="card space-y-6 p-6">
              {data.onscreen_text && (
                <Block label="текст на екрані">
                  <p className="text-[14px] leading-relaxed text-hi">
                    {data.onscreen_text}
                  </p>
                </Block>
              )}
              {data.caption && (
                <Block label="підпис">
                  <Markdown>{data.caption}</Markdown>
                </Block>
              )}
              {data.cta && (
                <Block label="заклик до дії">
                  <p className="text-[14px] leading-relaxed text-hi">{data.cta}</p>
                </Block>
              )}
              {data.hashtags?.length ? (
                <Block label="хештеги">
                  <Hashtags tags={data.hashtags} />
                </Block>
              ) : null}
            </div>
          </Section>
        </div>

        <aside className="space-y-4">
          <div className="card relative overflow-hidden p-5">
            <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent opacity-70" />
            <p className="eyebrow">зважений бал</p>
            <p className={`display mt-3 text-[42px] leading-none tabular-nums ${TONE_TEXT[tone]}`}>
              {score ?? "—"}
            </p>
            <p className="mono mt-2 text-[11px] text-lo">
              поріг «готово» — 85
            </p>
          </div>

          <div className="card p-5">
            <p className="eyebrow mb-4">рубрика</p>
            <Rubric quality={data.quality} />
          </div>

          <div className="card p-5">
            <p className="eyebrow mb-3.5">прогін</p>
            <dl className="space-y-2.5 text-[12.5px]">
              {[
                ["модель", data.model ?? "—"],
                ["версія флоу", data.flow_version ?? "—"],
                ["run_id", shortId(data.run_id)],
                ["створено", formatDateTime(data.created_at)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3">
                  <dt className="text-lo">{k}</dt>
                  <dd className="mono text-right text-mid">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="card relative overflow-hidden p-5">
            <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan to-transparent opacity-70" />
            <p className="eyebrow mb-3">day 4 · відео</p>
            <p className="mb-4 text-[12.5px] leading-relaxed text-mid">
              Запускає флоу Day 4: 4 межові кадри → 3 сегменти Veo по 8 с →
              субтитри → черга на затвердження. Триває кілька хвилин.
            </p>
            <form action={generateVideo.bind(null, data.id)} className="space-y-3">
              <select name="use_rag" defaultValue="true" className="field h-[34px] py-0 text-[12.5px]">
                <option value="true">З бренд-буком (RAG)</option>
                <option value="false">Без бренд-буку — для порівняння</option>
              </select>
              <button type="submit" className="btn btn-primary btn-sm w-full">
                Зробити відео
              </button>
            </form>
          </div>

          {projectId && (promote || reject) && (
            <div className="card p-5">
              <p className="eyebrow mb-3">ручний перегляд</p>
              <div className="flex flex-wrap gap-2">
                {promote && (
                  <form action={promote}>
                    <button type="submit" className="btn btn-sm btn-ghost">
                      Позначити готовим
                    </button>
                  </form>
                )}
                {reject && (
                  <form action={reject}>
                    <button type="submit" className="btn btn-danger">
                      Відхилити
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {projectId && (
            <div className="card p-5">
              <p className="eyebrow mb-3">небезпечна зона</p>
              <DeleteButton
                action={deleteContent.bind(null, projectId, data.id)}
                label="Видалити одиницю"
              />
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
