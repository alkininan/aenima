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
 * **Nothing here is awaited.** The session and the products are started and handed to the
 * frame as promises, so the chrome streams before either resolves (§4 "Chrome renders
 * before data", C-40) and the two islands that need them fill in when they arrive. The
 * anonymous redirect is the page's, as it is on `/i` and `/o`.
 *
 * **The frame does not receive the filters.** A layout gets no `searchParams` — it does
 * not re-render when they change — so the switcher reads them from the client instead.
 */
export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <Frame products={readProducts()} address={readAddress()}>
      {children}
    </Frame>
  );
}
