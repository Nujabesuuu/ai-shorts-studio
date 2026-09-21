import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { PageHeader, Section } from "@/components/ui";
import VideoPlayer from "@/components/VideoPlayer";
import Markdown from "@/components/Markdown";
import { setVideoStatus } from "@/app/actions/day4";
import {
  formatDateTime,
  parseSegments,
  shortId,
  videoStatusBadge,
  videoStatusLabel,
  type Day4Video,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function VideoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createClient();
  const { data: v, error } = await supabase
    .from("day4_videos")
    .select("*")
    .eq("id", id)
    .maybeSingle<Day4Video>();
  if (error) throw new Error(error.message);
  if (!v) notFound();

  const segments = parseSegments(v.segments);

  const approve = setVideoStatus.bind(null, v.id, "approved");
  const reject = setVideoStatus.bind(null, v.id, "rejected");

  return (
    <>
      <PageHeader
        eyebrow="day 4 · відео"
        title={v.title}
        backHref="/videos"
        subtitle={
          <div className="flex flex-wrap items-center gap-2">
            <span className={`badge ${videoStatusBadge(v.status)}`}>
              {videoStatusLabel(v.status)}
            </span>
            <span className={`badge ${v.use_rag ? "badge-accent" : "badge-neutral"}`}>
              {v.use_rag ? "з бренд-буком" : "без RAG"}
            </span>
            {v.video_url && <span className="badge badge-emerald">склеєно в один файл</span>}
          </div>
        }
        actions={
          v.content_id ? (
            <Link href={`/content/${v.content_id}`} className="btn btn-ghost">
              Сценарій Day 3
            </Link>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Section index="01" title="Перегляд" meta={`${segments.length} × 8 с · субтитри окремою доріжкою`}>
            <div className="card p-6">
              <VideoPlayer
                segments={segments}
                mergedUrl={v.video_url}
                vtt={v.subtitles_vtt}
              />
            </div>
          </Section>

          {v.caption && (
            <Section index="02" title="Підпис до публікації">
              <div className="card p-6">
                <Markdown>{v.caption}</Markdown>
              </div>
            </Section>
          )}
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <p className="eyebrow mb-3">гейт затвердження</p>
            <p className="mb-4 text-[12.5px] leading-relaxed text-mid">
              Публікація можлива лише після «Затвердити» — це і є людина в
              контурі перед випуском.
            </p>
            <div className="flex flex-wrap gap-2">
              {v.status !== "approved" && (
                <form action={approve}>
                  <button type="submit" className="btn btn-primary btn-sm">
                    Затвердити
                  </button>
                </form>
              )}
              {v.status !== "rejected" && (
                <form action={reject}>
                  <button type="submit" className="btn btn-danger">
                    Відхилити
                  </button>
                </form>
              )}
            </div>
          </div>

          <div className="card p-5">
            <p className="eyebrow mb-3">файл</p>
            {v.video_url ? (
              <a href={v.video_url} className="btn btn-ghost btn-sm" download>
                Завантажити final.mp4
              </a>
            ) : (
              <p className="text-[12.5px] leading-relaxed text-lo">
                Файл ще не склеєно — сегменти склеюються автоматично при
                генерації з адмінки. Якщо прогін був із Dify Studio,
                перезапустіть кнопкою «Зробити відео».
              </p>
            )}
          </div>

          <div className="card p-5">
            <p className="eyebrow mb-3">бренд-бук</p>
            <p className="text-[12.5px] leading-relaxed text-mid">
              {v.brand_alignment || "—"}
            </p>
            {v.missing_from_brandbook && v.missing_from_brandbook !== "—" && (
              <p className="mt-3 border-t border-line pt-3 text-[12px] leading-snug text-amber/90">
                Бракувало: {v.missing_from_brandbook}
              </p>
            )}
          </div>

          <div className="card p-5">
            <p className="eyebrow mb-3.5">прогін</p>
            <dl className="space-y-2.5 text-[12.5px]">
              {[
                ["модель", v.video_model ?? "veo-3.1"],
                ["run_id", shortId(v.run_id)],
                ["публікація", v.publish_at ? formatDateTime(v.publish_at) : "—"],
                ["створено", formatDateTime(v.created_at)],
              ].map(([k, val]) => (
                <div key={k} className="flex items-baseline justify-between gap-3">
                  <dt className="text-lo">{k}</dt>
                  <dd className="mono text-right text-mid">{val}</dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>
      </div>
    </>
  );
}
