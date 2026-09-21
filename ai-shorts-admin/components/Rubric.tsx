import {
  RUBRIC,
  TONE_BG,
  TONE_TEXT,
  criterionEvidence,
  criterionScore,
  scoreTone,
  type Quality,
} from "@/lib/db";

/**
 * Рубрика якості з доказами.
 *
 * Показуємо не лише бал, а й цитату, якою критик його обґрунтував. Це не
 * прикраса: у першому прогоні модель ставила 100 усьому підряд, і саме
 * порожня колонка доказів робить таку інфляцію видимою з першого погляду.
 */
export default function Rubric({
  quality,
  compact = false,
}: {
  quality: Quality | null;
  compact?: boolean;
}) {
  const any = RUBRIC.some((c) => criterionScore(quality, c.key) != null);
  if (!any) {
    return (
      <p className="text-[13px] text-lo">
        Оцінок немає — рядок створено вручну або до появи критика у флоу.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {RUBRIC.map((c) => {
        const score = criterionScore(quality, c.key);
        const evidence = criterionEvidence(quality, c.key);
        const tone = scoreTone(score);

        return (
          <li key={c.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13.5px] font-medium text-hi">{c.label}</span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="mono text-[10px] text-lo">×{c.weight}</span>
                <span className={`mono text-[13px] tabular-nums ${TONE_TEXT[tone]}`}>
                  {score == null ? "—" : score}
                </span>
              </span>
            </div>

            <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-surface-2">
              <div
                className={`h-full rounded-full ${TONE_BG[tone]}`}
                style={{ width: `${Math.max(0, Math.min(100, score ?? 0))}%` }}
              />
            </div>

            {!compact && (
              <p className="mt-2 text-[12px] leading-snug text-lo">
                {evidence ? (
                  <span className="text-mid">{evidence}</span>
                ) : score != null ? (
                  <span className="text-amber/80">
                    критик не навів цитати
                    {score > 95 ? " — у чинному флоу такий бал зрізало б до 95" : ""}
                  </span>
                ) : (
                  c.hint
                )}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
