import { Card } from "@/components/ui/Card";
import { DocReader } from "@/components/ui/DocReader";
import type { Dictionary } from "@/i18n";
import { relativeTime } from "@/lib/relative-time";

export type ArtifactView = {
  kind: keyof Dictionary["artifactKinds"];
  versionCount: number;
  /** Epoch ms, or null when nothing has been authored. */
  newestAt: number | null;
  currentVersionNo: number | null;
  currentBody: string | null;
};

/**
 * What the item owns, and what the newest version of each says.
 *
 * §7's five packs are the labels — `brief` is an Opportunity Brief, `prd` a PRD,
 * and so on — so an artifact is named the way the spec that defines it names it.
 *
 * **An artifact row with no versions is real and shows as such.** §3 keys each
 * stage on an artifact existing *as content*, so a container someone opened and
 * never wrote into advances nothing; `deriveStage` already ignores it, and
 * hiding it here would lose the fact that someone started.
 *
 * **The empty case is the ordinary one.** Most items own nothing, so §12's voice
 * applies: "nothing here yet", not "missing" and not "none".
 */
export function ArtifactList({
  artifacts,
  t,
  now,
}: {
  artifacts: readonly ArtifactView[];
  t: Dictionary;
  /** Epoch ms, passed in so the page renders identically on every call. */
  now: number;
}) {
  if (artifacts.length === 0) {
    return <p className="type-ui-body text-n-secondary">{t.item.noArtifacts}</p>;
  }

  return (
    <ul className="flex flex-col gap-[8px]">
      {artifacts.map((artifact) => {
        const relative = artifact.newestAt === null ? null : relativeTime(artifact.newestAt, now);
        const landed =
          relative === null
            ? null
            : relative.unit === "justNow"
              ? t.relativeTime.justNow
              : t.relativeTime[relative.unit](relative.value);

        return (
          <li key={artifact.kind}>
            <Card padding={20} className="flex flex-col gap-[12px]">
              <div className="flex flex-wrap items-baseline gap-[8px]">
                <h3 className="type-ui-headline text-n-primary">
                  {t.artifactKinds[artifact.kind]}
                </h3>
                {/* §3: counts and timestamps are mono-readout. */}
                <span className="type-mono-readout text-n-secondary">
                  {t.item.versionCount(artifact.versionCount)}
                  {landed ? ` · ${landed}` : ""}
                </span>
              </div>

              {artifact.currentBody === null ? (
                <p className="type-ui-footnote text-n-secondary">{t.item.noContent}</p>
              ) : (
                <DocReader body={artifact.currentBody} />
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
