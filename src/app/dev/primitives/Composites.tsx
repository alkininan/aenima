"use client";

/*
 * DELETE BEFORE LAUNCH — visual scaffold for T0.3 only.
 *
 * Every composite from the ticket, in its states, on --bg-base. Labels are
 * variant and state names, not product copy: real strings arrive with i18n.
 */
import { useState, type ReactNode } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Menu, type MenuEntry } from "@/components/ui/Menu";
import { Modal } from "@/components/ui/Modal";
import { Radio } from "@/components/ui/Radio";
import { Select, type SelectOption } from "@/components/ui/Select";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { Toggle } from "@/components/ui/Toggle";
import { Tooltip } from "@/components/ui/Tooltip";
import { AVATAR_SIZES, SKELETON_SHAPES, TOAST_TONES } from "@/components/ui/variants";

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-[16px]">
      <h2 className="type-mono-micro text-n-secondary">{label}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-[8px]">
      <span className="type-ui-footnote text-n-secondary">{label}</span>
      <div className="flex flex-wrap items-center gap-[12px]">{children}</div>
    </div>
  );
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="19" r="1.75" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 13h4l2 3h6l2-3h4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 5h14l2 8v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4Z" strokeLinejoin="round" />
    </svg>
  );
}

const SELECT_OPTIONS: readonly SelectOption[] = [
  { value: "feature", label: "Feature" },
  { value: "enhancement", label: "Enhancement" },
  { value: "technical", label: "Technical" },
  { value: "content", label: "Content" },
  { value: "experiment", label: "Experiment" },
  { value: "fix", label: "Fix" },
  { value: "spike", label: "Spike" },
];

/* Long enough to pass the 320px max height and show the inner scroll. */
const LONG_OPTIONS: readonly SelectOption[] = Array.from({ length: 14 }, (_, index) => ({
  value: `option-${index}`,
  label: `Option ${String(index + 1).padStart(2, "0")}`,
}));

const DISABLED_OPTIONS: readonly SelectOption[] = [
  { value: "one", label: "Walkable" },
  { value: "two", label: "Skipped", disabled: true },
  { value: "three", label: "Walkable again" },
];

const MENU_ENTRIES: readonly MenuEntry[] = [
  { kind: "section", label: "Item" },
  { kind: "item", label: "Open", onSelect: () => {} },
  { kind: "item", label: "Duplicate", onSelect: () => {} },
  { kind: "item", label: "Unavailable", onSelect: () => {}, disabled: true },
  { kind: "separator" },
  { kind: "section", label: "Danger" },
  { kind: "item", label: "Delete", onSelect: () => {}, destructive: true },
];

const TAB_ITEMS = [
  { value: "overview", label: "Overview" },
  { value: "evidence", label: "Evidence" },
  { value: "decisions", label: "Decisions" },
  { value: "locked", label: "Locked", disabled: true },
] as const;

function ToastRow() {
  const { toast } = useToast();

  return (
    <>
      <Row label="tones">
        {TOAST_TONES.map((tone) => (
          <Button
            key={tone}
            variant="secondary"
            size="sm"
            onClick={() => toast({ tone, message: `${tone} toast` })}
          >
            {tone}
          </Button>
        ))}
      </Row>
      <Row label="with undo action">
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            toast({ message: "Parked", action: { label: "Undo", onAction: () => {} } })
          }
        >
          undo toast
        </Button>
      </Row>
      <Row label="hover pauses the 5s clock">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => toast({ tone: "warning", message: "Hover me before this disappears" })}
        >
          pause on hover
        </Button>
      </Row>
    </>
  );
}

function Composites() {
  const [type, setType] = useState<string | null>(null);
  const [long, setLong] = useState<string | null>("option-9");
  const [gapped, setGapped] = useState<string | null>(null);
  const [tab, setTab] = useState("overview");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [contentOpen, setContentOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex flex-col gap-[48px]">
      <Section label="Tooltip">
        <Row label="top · bottom · on a chip">
          <Tooltip content="500ms in, instant out">
            <Button variant="secondary">tooltip above</Button>
          </Tooltip>
          <Tooltip side="bottom" content="Opens below the trigger instead">
            <Button variant="secondary">tooltip below</Button>
          </Tooltip>
          <Tooltip content="Tooltips wrap at 240 and never grow an arrow — this line is long enough to prove it">
            <Chip interactive>long tooltip</Chip>
          </Tooltip>
        </Row>
      </Section>

      <Section label="Select">
        <div className="grid gap-[24px] sm:grid-cols-2">
          <Select
            label="placeholder"
            placeholder="Pick a type"
            options={SELECT_OPTIONS}
            value={type}
            onValueChange={setType}
            helper="Arrow keys walk, letters jump"
          />
          <Select
            label="selected + inner scroll"
            options={LONG_OPTIONS}
            value={long}
            onValueChange={setLong}
            helper="14 rows past the 320 max height"
          />
          <Select
            label="disabled option"
            placeholder="One row is skipped"
            options={DISABLED_OPTIONS}
            value={gapped}
            onValueChange={setGapped}
          />
          <Select
            label="error"
            placeholder="Pick a type"
            options={SELECT_OPTIONS}
            value={null}
            onValueChange={() => {}}
            invalid
            helper="helper flips to danger"
          />
          <Select
            label="disabled"
            placeholder="Pick a type"
            options={SELECT_OPTIONS}
            value={null}
            onValueChange={() => {}}
            disabled
          />
        </div>
      </Section>

      <Section label="Checkbox and radio">
        <Row label="checkbox">
          <Checkbox label="unchecked" />
          <Checkbox label="checked" defaultChecked />
          <Checkbox label="disabled" disabled />
          <Checkbox label="disabled checked" disabled defaultChecked />
        </Row>
        <Row label="radio — one name, arrow keys walk the group">
          <Radio name="preview-radio" value="a" label="first" defaultChecked />
          <Radio name="preview-radio" value="b" label="second" />
          <Radio name="preview-radio" value="c" label="disabled" disabled />
        </Row>
      </Section>

      <Section label="Toggle">
        <Row label="states">
          <Toggle label="off" />
          <Toggle label="on" defaultChecked />
          <Toggle label="disabled" disabled />
          <Toggle label="disabled on" disabled defaultChecked />
          <Toggle aria-label="unlabelled" />
        </Row>
      </Section>

      <Section label="Tabs">
        <Tabs items={TAB_ITEMS} value={tab} onValueChange={setTab} label="Preview tabs" />
        <span className="type-ui-footnote text-n-secondary">active: {tab}</span>
      </Section>

      <Section label="Menu">
        <Row label="aligned to the trigger's start · end">
          <Menu
            label="Item actions"
            entries={MENU_ENTRIES}
            trigger={<IconButton variant="secondary" label="Open menu" icon={<DotsIcon />} />}
          />
          <Menu
            label="Item actions, end aligned"
            align="end"
            entries={MENU_ENTRIES}
            trigger={<Button variant="secondary">overflow</Button>}
          />
        </Row>
      </Section>

      <Section label="Toast">
        <ToastRow />
      </Section>

      <Section label="Modal and sheet">
        <Row label="max 400 · max 640 · 480 sheet">
          <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
            confirm modal
          </Button>
          <Button variant="secondary" onClick={() => setContentOpen(true)}>
            content modal
          </Button>
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>
            side sheet
          </Button>
        </Row>

        <Modal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title="Confirm modal"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setConfirmOpen(false)}>Looks right</Button>
            </>
          }
        >
          Focus is trapped in here, Esc closes it, and focus goes back to the button that opened it.
        </Modal>

        <Modal
          open={contentOpen}
          onClose={() => setContentOpen(false)}
          title="Content modal"
          width="content"
          footer={
            <>
              <Button variant="ghost" onClick={() => setContentOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setContentOpen(false)}>Looks right</Button>
            </>
          }
        >
          <div className="flex flex-col gap-[16px]">
            <p>The body scrolls and the footer stays put.</p>
            <Select
              label="a popover inside a modal"
              placeholder="Esc closes this first"
              options={SELECT_OPTIONS}
              value={null}
              onValueChange={() => {}}
            />
            {Array.from({ length: 8 }, (_, index) => (
              <p key={index}>Filler line {index + 1} — enough content to make the body scroll.</p>
            ))}
          </div>
        </Modal>

        <Sheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="Side sheet"
          footer={<Button onClick={() => setSheetOpen(false)}>Done</Button>}
        >
          480 wide, slides in from the right, rounded on the leading corners only.
        </Sheet>
      </Section>

      <Section label="Avatar">
        <Row label="size scale">
          {AVATAR_SIZES.map((size) => (
            <Avatar key={size} size={size} name="Ada Lovelace" />
          ))}
        </Row>
        <Row label="status dot">
          <Avatar size={32} name="Ada Lovelace" status="present" statusLabel="present" />
          <Avatar size={40} name="Ada Lovelace" status="away" statusLabel="away" />
          <Avatar size={96} name="Ada Lovelace" status="present" statusLabel="present" />
          <Avatar size={24} status="away" statusLabel="away" />
        </Row>
      </Section>

      <Section label="Empty state">
        <div className="grid gap-[24px] sm:grid-cols-2">
          <div className="rounded-sm border border-glass-border">
            <EmptyState icon={<InboxIcon />} action={<Button size="sm">Back to dashboard</Button>}>
              Nothing needs you right now
            </EmptyState>
          </div>
          <div className="overflow-hidden rounded-sm border border-glass-border">
            <EmptyState
              textured
              icon={<InboxIcon />}
              action={
                <Button size="sm" variant="secondary">
                  Retry
                </Button>
              }
            >
              Same state on the dot grid
            </EmptyState>
          </div>
        </div>
      </Section>

      <Section label="Skeleton">
        <Row label="shapes">
          {SKELETON_SHAPES.map((shape) => (
            <Skeleton
              key={shape}
              shape={shape}
              className={shape === "circle" ? "size-[40px]" : "h-[40px] w-[160px]"}
            />
          ))}
        </Row>
        <Row label="a row standing in for real content">
          <div className="flex w-full max-w-[420px] items-center gap-[12px]" aria-busy="true">
            <Skeleton shape="circle" className="size-[32px]" />
            <SkeletonText lines={2} className="flex-1" />
          </div>
        </Row>
      </Section>
    </div>
  );
}

export function CompositesPreview() {
  return (
    <ToastProvider>
      <Composites />
    </ToastProvider>
  );
}
