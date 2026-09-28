import { Frame } from "@/components/frame/Frame";

import { devOnly } from "./dev-only";
import { DEV_ADDRESS, DEV_DASHBOARD, DEV_PRODUCTS } from "./frame-fixture";

/**
 * DELETE BEFORE LAUNCH, along with everything else under /dev.
 *
 * The segment-level half of the gate: it covers /dev/* as a whole, so a
 * preview page added later is 404 in production the moment it exists, even if
 * whoever adds it forgets the page-level call. See `dev-only.ts` for why both
 * halves are needed.
 *
 * And the frame — design-spec §4's, the same component the signed-in segments
 * render (C-40: "on every route"), over fixture reads: the previews stand inside
 * the chrome the product has, so the browser checks measure the frame where they
 * can reach it.
 */
export default function DevLayout({ children }: LayoutProps<"/dev">) {
  devOnly();

  return (
    <Frame
      products={Promise.resolve(DEV_PRODUCTS)}
      address={Promise.resolve(DEV_ADDRESS)}
      dashboardHref={DEV_DASHBOARD}
    >
      {children}
    </Frame>
  );
}
