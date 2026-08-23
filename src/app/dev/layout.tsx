import { devOnly } from "./dev-only";

/**
 * DELETE BEFORE LAUNCH, along with everything else under /dev.
 *
 * The segment-level half of the gate: it covers /dev/* as a whole, so a
 * preview page added later is 404 in production the moment it exists, even if
 * whoever adds it forgets the page-level call. See `dev-only.ts` for why both
 * halves are needed.
 */
export default function DevLayout({ children }: LayoutProps<"/dev">) {
  devOnly();

  return children;
}
