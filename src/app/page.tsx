import { AeMark } from "@/components/AeMark";

/**
 * Placeholder root. The create-next-app template that stood here carried
 * light-mode classes and hardcoded hexes, which contradict the dark-only
 * decision in design-spec.md §16.
 *
 * The copy is a placeholder: real strings arrive through `src/i18n` in EN/TR/NL.
 * §1 puts the mark at 32 on doc headers, and §10 uses the same 32 on the
 * standalone pages this most resembles.
 */
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-[16px] px-[24px] text-center">
      <AeMark size={32} className="text-n-primary" />
      <p className="type-ui-body text-n-secondary">Foundation in place. No product surfaces yet.</p>
    </main>
  );
}
