import { DOC_READER_CLASSES } from "./variants";

type DocReaderProps = {
  /**
   * The document's body.
   *
   * A string, because that is what an artifact version currently holds:
   * `content` is jsonb and the only shape anything writes is `{ body: string }`.
   * §8's headings and EARS/GWT blocks have nothing to render until authored
   * content carries them, so the classes exist (`DOC_READER_HEADING_CLASSES`,
   * `DOC_READER_CODE_CLASSES`) and this does not reach for them — the same
   * discipline `stage.ts` uses for a branch that cannot yet be taken.
   *
   * Phase 3's authoring engine owns what content becomes; when it grows blocks,
   * this grows a prop rather than being rewritten.
   */
  body: string;
  className?: string;
};

/**
 * The reading surface (design-spec.md §8) — 68ch, ui-body.
 *
 * The measure is the point. §8 caps a document at 68 characters because longer
 * lines lose the reader between one and the next, and every surface that renders
 * a document owes that constraint: the item page now, the packet and the
 * walkthrough later.
 *
 * Blank lines separate paragraphs, which is the one piece of structure a plain
 * body can carry without inventing a format for it.
 */
export function DocReader({ body, className }: DocReaderProps) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  return (
    <div
      data-testid="doc-reader"
      className={className ? `${DOC_READER_CLASSES} ${className}` : DOC_READER_CLASSES}
    >
      {paragraphs.map((paragraph, index) => (
        // Index keys: paragraphs have no identity of their own, and the list is
        // rebuilt whole on every render rather than reordered.
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}
