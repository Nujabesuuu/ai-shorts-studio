import { clock, parseScript, type ScriptFrame } from "@/lib/db";

/**
 * Сценарій із day3_content.script у вигляді монтажного листа.
 *
 * Для reels/stories кадри мають таймкоди, тому зверху йде пропорційна
 * смуга: одразу видно, чи не з'їв перший кадр половину ролика. Для
 * carousel таймкодів немає за визначенням — там просто нумеровані слайди,
 * і смугу не малюємо, щоб не вдавати те, чого в даних немає.
 */

function frameLabel(frame: ScriptFrame, index: number, timed: boolean): string {
  const n = typeof frame.n === "number" ? frame.n : index + 1;
  if (!timed) return String(n).padStart(2, "0");
  return `${clock(frame.t_start)}–${clock(frame.t_end)}`;
}

export default function ScriptTimeline({
  script,
  format,
}: {
  script: unknown;
  format: string;
}) {
  const frames = parseScript(script);
  if (frames.length === 0) {
    return (
      <p className="text-[13px] text-lo">
        Сценарій порожній — флоу не повернув жодного кадру.
      </p>
    );
  }

  const timed =
    format !== "carousel" &&
    frames.some((f) => (f.t_end ?? 0) > (f.t_start ?? 0));

  const total = timed
    ? Math.max(...frames.map((f) => f.t_end ?? 0), 1)
    : frames.length;

  return (
    <div>
      {timed && (
        <div className="mb-5">
          <div className="flex h-1.5 gap-[3px] overflow-hidden rounded-full">
            {frames.map((frame, i) => {
              const span = Math.max((frame.t_end ?? 0) - (frame.t_start ?? 0), 0.5);
              return (
                <span
                  key={i}
                  className="rounded-full bg-accent transition-opacity"
                  style={{
                    flexGrow: span,
                    opacity: 0.35 + (0.65 * (frames.length - i)) / frames.length,
                  }}
                />
              );
            })}
          </div>
          <div className="mono mt-2 flex justify-between text-[10px] text-lo">
            <span>0:00</span>
            <span>{clock(total)}</span>
          </div>
        </div>
      )}

      <ol className="space-y-0">
        {frames.map((frame, i) => (
          <li
            key={i}
            className="group relative grid grid-cols-[68px_minmax(0,1fr)] gap-4 border-t border-line py-4 first:border-t-0 first:pt-0 sm:grid-cols-[92px_minmax(0,1fr)]"
          >
            <div className="pt-0.5">
              <span className="mono block text-[11px] leading-tight tracking-[0.02em] text-accent">
                {frameLabel(frame, i, timed)}
              </span>
              <span className="eyebrow mt-1.5 block">
                {timed ? "кадр" : "слайд"}
              </span>
            </div>

            <div className="min-w-0 space-y-2.5">
              {frame.visual && (
                <p className="text-[14px] leading-relaxed text-hi">{frame.visual}</p>
              )}
              {frame.voiceover && (
                <p className="border-l-2 border-line-strong pl-3 text-[13.5px] leading-relaxed text-mid">
                  «{frame.voiceover}»
                </p>
              )}
              {!frame.visual && !frame.voiceover && (
                <p className="text-[13px] text-lo">Кадр без опису</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
