import { Frame } from "@/components/frame/Frame";

import { readAddress, readProducts } from "../frame-reads";

/** The opportunity page's frame — see `src/app/app/layout.tsx`; one component on every route (C-40). */
export default function OpportunityLayout({ children }: LayoutProps<"/o">) {
  return (
    <Frame products={readProducts()} address={readAddress()}>
      {children}
    </Frame>
  );
}
