"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Avatar } from "@/components/ui/Avatar";
import { Menu } from "@/components/ui/Menu";
import { ChevronDownIcon } from "@/components/ui/icons";
import { getDictionary } from "@/i18n";
import { LIST_PARAMS, listHref } from "@/lib/routes";

export type SwitcherProduct = { slug: string; name: string };

/**
 * §4's product switcher: "avatar 40 + display-md".
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
 */
export function ProductSwitcher({ products }: { products: readonly SwitcherProduct[] }) {
  const t = getDictionary();
  const router = useRouter();
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
  const selected = products.find((product) => product.slug === active);
  const label = selected?.name ?? t.list.allStages;

  return (
    <Menu
      label={t.list.title}
      trigger={
        <button
          type="button"
          className="control control-edge-none flex w-full items-center gap-[8px] rounded-pill p-[4px] text-left"
        >
          {/* §8: switcher avatar is 40. Initials when there is no portrait — a
              product has none, and will not until someone uploads one. */}
          <Avatar size={40} name={label} />
          <span className="type-display-md min-w-0 flex-1 truncate text-n-primary">{label}</span>
          <span className="shrink-0 text-n-secondary [&_svg]:size-[20px]">
            <ChevronDownIcon />
          </span>
        </button>
      }
      entries={[
        {
          kind: "item",
          label: t.list.allStages,
          onSelect: () => router.push(listHref(current, { product: null })),
        },
        { kind: "separator" },
        ...products.map((product) => ({
          kind: "item" as const,
          label: product.name,
          onSelect: () => router.push(listHref(current, { product: product.slug })),
        })),
      ]}
    />
  );
}
