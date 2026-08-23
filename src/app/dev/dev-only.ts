import { notFound } from "next/navigation";

/**
 * DELETE BEFORE LAUNCH, along with everything else under /dev.
 *
 * The preview pages here are a build tool, not a product surface. They are
 * marked delete-before-launch, but "we will remember to delete it" is not a
 * control, so the segment is gated on the build mode instead.
 *
 * `next dev` sets `NODE_ENV` to "development" and this passes straight
 * through, which is why the e2e suite can still drive /dev/primitives.
 * `next build` sets it to "production" and Next inlines the value, so there
 * the call is unconditional — not a runtime branch an env var can flip on.
 *
 * Call it from the segment layout *and* from the first line of every page
 * body. The layout alone is not enough: Next renders a layout and its children
 * concurrently, so a layout-only `notFound()` returns status 404 with the
 * page's fully rendered RSC payload still in the body. Verified — the gated
 * page came back 404 and 179 KB, preview markup included. Calling this before
 * a page builds any JSX is what keeps the content from existing at all.
 */
export function devOnly(): void {
  if (process.env.NODE_ENV === "production") notFound();
}
