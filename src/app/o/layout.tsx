import { Frame } from "@/components/frame/Frame";

import { readAddress, readProducts } from "../frame-reads";

/**
 * Dynamic, and said so. Every route under this frame reads cookies or search params, and
 * the frame's own switcher reads `useSearchParams()`, which a static prerender cannot do
 * without a Suspense boundary; `/app` was dynamic by its cookie read before the layout
 * stopped awaiting anything, and this keeps it that way rather than adding a boundary that
 * exists only to satisfy the prerenderer.
 */
export const dynamic = "force-dynamic";

/** The opportunity page's frame — see `src/app/app/layout.tsx`; one component on every route (C-40). */
export default async function OpportunityLayout({ children }: LayoutProps<"/o">) {
  const address = await readAddress();

  return (
    <Frame products={readProducts()} address={address}>
      {children}
    </Frame>
  );
}
