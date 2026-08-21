/*
 * DELETE BEFORE LAUNCH — visual scaffold for T0.2 and T0.3 only.
 *
 * Renders every variant, size and state of the primitives on --bg-base so the
 * design system can be eyeballed. No product surface links here, nothing here
 * ships, and the labels below are variant names, not product copy.
 *
 * The page stays a Server Component; the composites need state, so they live in
 * a client island below.
 */
import { AeMark } from "@/components/AeMark";
import { CompositesPreview } from "./Composites";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import {
  BUTTON_SIZES,
  BUTTON_VARIANTS,
  CHIP_GAP_TONES,
  SPINNER_SIZES,
} from "@/components/ui/variants";

/* Placeholder glyphs — the icon set is not part of T0.2. */
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

const TYPE_SCALE = [
  ["type-display-xl", "display-xl — 32/38"],
  ["type-display-lg", "display-lg — 24/28"],
  ["type-display-md", "display-md — 18/24"],
  ["type-display-num", "display-num — 18/22 · 0123456789"],
  ["type-ui-headline", "ui-headline — 17/22"],
  ["type-ui-button", "ui-button — 17/20"],
  ["type-ui-input", "ui-input — 17/22"],
  ["type-ui-subhead", "ui-subhead — 15/22"],
  ["type-ui-button-sm", "ui-button-sm — 15/20"],
  ["type-ui-body", "ui-body — 15/22 · ığüşöç ĳ ë — TR/NL coverage"],
  ["type-ui-footnote", "ui-footnote — 13/18"],
  ["type-ui-caption", "ui-caption — 12/16"],
  ["type-mono-code", "type-mono-code — 14/22"],
  ["type-mono-readout", "mono-readout — 12/16 · 2026-08-21 · 1234567890"],
  ["type-mono-micro", "mono-micro — 10/14"],
  ["type-special-otp", "special-otp — 22/24 · 048261"],
] as const;

const TYPE_BADGES = [
  "Feature",
  "Enhancement",
  "Technical",
  "Content",
  "Experiment",
  "Fix",
  "Spike",
] as const;

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-[16px]">
      <h2 className="type-mono-micro text-n-secondary">{label}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[8px]">
      <span className="type-ui-footnote text-n-secondary">{label}</span>
      <div className="flex flex-wrap items-center gap-[12px]">{children}</div>
    </div>
  );
}

export default function PrimitivesPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-[48px] px-[24px] py-[48px]">
      <header className="flex flex-wrap items-end gap-[16px]">
        <AeMark size={32} className="text-n-primary" />
        <AeMark size={24} className="text-n-primary" />
        <AeMark size={16} className="text-n-primary" />
        <AeMark size={32} className="text-prime" />
        <h1 className="type-display-xl text-n-primary">Primitives</h1>
      </header>

      <Section label="Type scale">
        <div className="flex flex-col gap-[8px]">
          {TYPE_SCALE.map(([className, sample]) => (
            <p key={className} className={`${className} text-n-primary`}>
              {sample}
            </p>
          ))}
        </div>
      </Section>

      <Section label="Button">
        {BUTTON_VARIANTS.map((variant) => (
          <div key={variant} className="flex flex-col gap-[12px]">
            <span className="type-ui-subhead text-n-primary">{variant}</span>
            {BUTTON_SIZES.map((size) => (
              <Row key={size} label={size}>
                <Button variant={variant} size={size}>
                  {variant}
                </Button>
                <Button variant={variant} size={size} leadingIcon={<PlusIcon />}>
                  leading
                </Button>
                <Button variant={variant} size={size} trailingIcon={<ChevronIcon />}>
                  trailing
                </Button>
                <Button
                  variant={variant}
                  size={size}
                  leadingIcon={<PlusIcon />}
                  trailingIcon={<ChevronIcon />}
                >
                  both
                </Button>
                <Button variant={variant} size={size} loading>
                  loading
                </Button>
                <Button variant={variant} size={size} disabled>
                  disabled
                </Button>
              </Row>
            ))}
          </div>
        ))}
        <Row label="full width">
          <div className="w-full max-w-[320px]">
            <Button fullWidth>full width</Button>
          </div>
        </Row>
      </Section>

      <Section label="Icon button">
        {BUTTON_VARIANTS.map((variant) => (
          <Row key={variant} label={variant}>
            {BUTTON_SIZES.map((size) => (
              <IconButton
                key={size}
                variant={variant}
                size={size}
                label={`${variant} ${size}`}
                icon={<PlusIcon />}
              />
            ))}
            {BUTTON_SIZES.map((size) => (
              <IconButton
                key={`${size}-loading`}
                variant={variant}
                size={size}
                loading
                label={`${variant} ${size} loading`}
                icon={<PlusIcon />}
              />
            ))}
            {BUTTON_SIZES.map((size) => (
              <IconButton
                key={`${size}-disabled`}
                variant={variant}
                size={size}
                disabled
                label={`${variant} ${size} disabled`}
                icon={<PlusIcon />}
              />
            ))}
          </Row>
        ))}
      </Section>

      <Section label="Input">
        <div className="grid gap-[24px] sm:grid-cols-2">
          <Input placeholder="placeholder" aria-label="bare" />
          <Input label="label" helper="helper" placeholder="placeholder" />
          <Input label="leading icon" leadingIcon={<SearchIcon />} placeholder="search" />
          <Input
            label="trailing icon"
            trailingIcon={<ChevronIcon />}
            defaultValue="filled"
            readOnly
          />
          <Input
            label="error"
            helper="helper flips to danger"
            invalid
            defaultValue="bad"
            readOnly
          />
          <Input label="disabled" helper="helper" placeholder="placeholder" disabled />
        </div>
      </Section>

      <Section label="Chip">
        <Row label="base">
          <Chip>base</Chip>
          <Chip leadingIcon={<PlusIcon />}>leading</Chip>
          <Chip interactive>interactive</Chip>
          <Chip interactive trailingIcon={<ChevronIcon />}>
            interactive
          </Chip>
        </Row>
        <Row label="type badge">
          {TYPE_BADGES.map((badge) => (
            <Chip key={badge} variant="type-badge">
              {badge}
            </Chip>
          ))}
        </Row>
        <Row label="gap chip">
          {CHIP_GAP_TONES.map((tone) => (
            <Chip key={tone} variant="gap" tone={tone}>
              {tone}
            </Chip>
          ))}
          {CHIP_GAP_TONES.map((tone) => (
            <Chip key={`${tone}-interactive`} variant="gap" tone={tone} interactive>
              {tone}
            </Chip>
          ))}
        </Row>
        <Row label="count badge">
          <span className="type-display-num inline-flex h-[24px] items-center rounded-pill bg-surface-2 px-[10px] text-n-primary">
            12
          </span>
        </Row>
      </Section>

      <Section label="Spinner">
        <Row label="prime">
          {SPINNER_SIZES.map((size) => (
            <Spinner key={size} size={size} />
          ))}
        </Row>
        <Row label="on prime fill">
          {SPINNER_SIZES.map((size) => (
            <span
              key={size}
              className="inline-flex items-center justify-center rounded-pill bg-prime p-[12px]"
            >
              <Spinner size={size} tone="on-prime" />
            </span>
          ))}
        </Row>
      </Section>

      <CompositesPreview />
    </main>
  );
}
