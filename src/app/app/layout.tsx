import { Frame } from "@/components/frame/Frame";

import { readAddress, readProducts } from "../frame-reads";

/**
 * The signed-in shell for the list — design-spec §4's frame, rendered by every signed-in
 * segment layout (`/app`, `/i`, `/o`) and by `/dev`'s over fixtures.
 *
 * It lives in the segment layouts rather than the root layout so `/` and `/sign-in` stay
 * chrome-free: a landing page carrying a product sidebar would be offering navigation to
 * someone who cannot use it.
 *
 * **Only the session is awaited** — a signature check on the cookie, which is also what
 * turns an anonymous visitor away with a 307 before anything streams. The products are
 * started and handed to the frame as a promise, so the chrome streams before the workspace
 * read resolves (§4 "Chrome renders before data", C-40) and the switcher fills its rows
 * when it does.
 *
 * **The frame does not receive the filters.** A layout gets no `searchParams` — it does
 * not re-render when they change — so the switcher reads them from the client instead.
 */
/**
 * Dynamic, and said so. Every route under this frame reads cookies or search params, and
 * the frame's own switcher reads `useSearchParams()`, which a static prerender cannot do
 * without a Suspense boundary; `/app` was dynamic by its cookie read before the layout
 * stopped awaiting anything, and this keeps it that way rather than adding a boundary that
 * exists only to satisfy the prerenderer.
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const address = await readAddress();

  return (
    <Frame products={readProducts()} address={address}>
      {children}
    </Frame>
  );
}
