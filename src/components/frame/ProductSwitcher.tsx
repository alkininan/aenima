"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Avatar } from "@/components/ui/Avatar";
import { Menu } from "@/components/ui/Menu";
import { ChevronDownIcon } from "@/components/ui/icons";
import { SIDEBAR_ROW_CLASSES } from "@/components/ui/variants";
import { getDictionary } from "@/i18n";
import { cx } from "@/lib/cx";
import { LIST_PARAMS, listHref } from "@/lib/routes";

import { usePromise } from "./usePromise";

export type SwitcherProduct = { slug: string; name: string };

const NO_PRODUCTS: readonly SwitcherProduct[] = [];

/**
 * §4's product switcher, in its two chromes: in the sidebar "a 56 row directly beneath the
 * lockup — avatar 40 + display-md, chevron `nav-arrow-down` 20"; in the hand top bar
 * "beside the mark — avatar 32, name display-md, truncating". Both are one §8.18 menu whose
 * rows are the products.
 */
export type SwitcherVariant = "sidebar" | "topbar";

/**
 * §4's product switcher.
 *
 * It **filters the list** rather than navigating to a product page. §13's list
 * is a workspace-wide priority queue — "anything awaiting a human" — so the
 * switcher narrows what is already there instead of moving somewhere else, and
 * "All products" is a real and default choice rather than an absence.
 *
 * A client island because a menu is focus management and arrow-key movement.
 * What it writes is a URL, though, so the filtered list is still rendered on the
 * server, is shareable, and comes back with the browser's back button.
 *
 * **It reads its own copy rather than being handed a dictionary** — see
 * `ItemRowMenu` for why: the dictionary holds formatter functions, and a
 * function cannot be serialized across the server/client boundary.
 *
 * **Chrome before data** (§4, C-40): the products arrive as the promise the layout
 * started, not awaited — the trigger and its "All" row are drawn from the route alone,
 * hydrate at once and open before the workspace read resolves, and the rows fill in when
 * it does. No skeleton and no Suspense: the switcher is chrome, only the page topbar's two
 * data slots ever skeleton, and a pending boundary's fallback would be inert (`usePromise`).
 */
export function ProductSwitcher({
  products,
  variant,
}: {
  products: Promise<readonly SwitcherProduct[]>;
  variant: SwitcherVariant;
}) {
  const t = getDictionary();
  const router = useRouter();
  const rows = usePromise(products, NO_PRODUCTS);
  /**
   * Read here rather than passed down, because the sidebar is a layout and a
   * layout receives no `searchParams`. Reading them client-side keeps the chrome
   * out of the page — which is what stops the whole sidebar re-mounting every
   * time someone picks a stage.
   */
  const params = useSearchParams();
  const active = params.get(LIST_PARAMS.product) ?? undefined;
  const current = {
    stage: params.get(LIST_PARAMS.stage) ?? undefined,
    product: active,
  };
  const selected = rows.find((product) => product.slug === active);
  const label = selected?.name ?? t.list.allStages;

  return (
    <Menu
      label={t.list.title}
      className={variant === "sidebar" ? "w-full" : "min-w-0 max-w-full"}
      trigger={
        <button
          type="button"
          data-testid="frame-switcher"
          className={cx(
            "control control-edge-none flex min-w-0 items-center gap-[8px] rounded-pill text-left",
            variant === "sidebar"
              ? cx(SIDEBAR_ROW_CLASSES, "px-[8px]")
              : "h-[40px] w-full max-w-full px-[4px]",
          )}
        >
          {/* §8: switcher avatar is 40 in the sidebar and 32 in the top bar. Initials when
              there is no portrait — a product has none, and will not until someone uploads
              one. */}
          <Avatar size={variant === "sidebar" ? 40 : 32} name={label} />
          <span className="type-display-md min-w-0 flex-1 truncate text-n-primary">{label}</span>
          {variant === "sidebar" ? (
            <span className="shrink-0 text-n-secondary [&_svg]:size-[20px]">
              <ChevronDownIcon />
            </span>
          ) : null}
        </button>
      }
      entries={[
        {
          kind: "item",
          label: t.list.allStages,
          onSelect: () => router.push(listHref(current, { product: null })),
        },
        { kind: "separator" },
        ...rows.map((product) => ({
          kind: "item" as const,
          label: product.name,
          onSelect: () => router.push(listHref(current, { product: product.slug })),
        })),
      ]}
    />
  );
}
