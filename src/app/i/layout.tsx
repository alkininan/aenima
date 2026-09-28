import { Frame } from "@/components/frame/Frame";

import { readAddress, readProducts } from "../frame-reads";

/** The item page's frame — see `src/app/app/layout.tsx`; one component on every route (C-40). */
export default function ItemLayout({ children }: LayoutProps<"/i">) {
  return (
    <Frame products={readProducts()} address={readAddress()}>
      {children}
    </Frame>
  );
}
