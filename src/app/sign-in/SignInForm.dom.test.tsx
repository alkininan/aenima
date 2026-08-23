import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requestCode = vi.fn();
const verifyCode = vi.fn();

vi.mock("./actions", () => ({
  requestCode: (...args: unknown[]) => requestCode(...args),
  verifyCode: (...args: unknown[]) => verifyCode(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

const { SignInForm } = await import("./SignInForm");

/**
 * The §8 (v2.7) step header, on the step that needs a backend to reach.
 *
 * The browser pass covers step one — alignment, the focus split, the absent
 * placeholder — but the code step is behind a server action that talks to
 * Supabase, which is why the OTP geometry tests drive /dev/primitives instead.
 * What is left to prove is structural, and structure is exactly what jsdom can
 * see: where the back control sits relative to the title and the primary.
 */
async function reachCodeStep() {
  requestCode.mockResolvedValue({ status: "sent" });
  const user = userEvent.setup();
  render(<SignInForm />);

  await user.type(screen.getByLabelText("Email"), "someone@example.com");
  await user.click(screen.getByRole("button", { name: "Send code" }));

  await screen.findByRole("heading", { name: "Enter your code" });
  return user;
}

const backButton = () => screen.getByRole("button", { name: "Back" });
const primary = () => screen.getByRole("button", { name: "Continue" });

describe("sign-in step header", () => {
  beforeEach(() => {
    requestCode.mockReset();
    verifyCode.mockReset();
  });

  // §8: back appears "whenever a previous step exists" — step one has none.
  it("offers no back control on the first step", () => {
    render(<SignInForm />);

    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Sign in" })).not.toBeNull();
  });

  it("puts back in the header beside the title, not in an action row", async () => {
    await reachCodeStep();

    const heading = screen.getByRole("heading", { name: "Enter your code" });
    const header = heading.closest("div")!.parentElement!;

    // The back control shares the header with the title block.
    expect(within(header).getByRole("button", { name: "Back" })).toBe(backButton());
    // And is nowhere near the primary — the v2.3 action row that held both is
    // gone, so they no longer share a parent.
    expect(backButton().parentElement).not.toBe(primary().parentElement);
  });

  /**
   * §8 (v2.7): the back is the neutral variant — a visible `--surface-2` circle,
   * because ghost disappears in a header. The v2.5 optical pull that dragged the
   * ghost 12 left goes with it: a control with its own edge sits on the column
   * edge, so re-adding the pull would push the fill outside the column.
   */
  it("gives back a visible neutral fill and no optical pull", async () => {
    await reachCodeStep();

    expect(backButton().className).toContain("bg-surface-2");
    expect(backButton().className).not.toContain("-ml-");
  });

  /**
   * §8 (v2.7): a step with no back button centers its title and subtitle; a step
   * with one keeps them left-aligned to each other, "never centered beside a
   * back control". The browser pass measures the painted glyphs on step one —
   * this is the half of the rule that only the unreachable step can show.
   */
  it("centers the title block on step one and left-aligns it on step two", async () => {
    const titleBlock = () => screen.getByRole("heading").closest("div")!;

    const { unmount } = render(<SignInForm />);
    expect(titleBlock().className).toContain("text-center");
    unmount();

    await reachCodeStep();
    expect(titleBlock().className).not.toContain("text-center");
  });

  /**
   * §8: "the primary fills the content width alone." The regression this
   * catches is the action row coming back — a back button re-appearing beside
   * the primary would take width from it, and `flex-1` is how it used to.
   */
  it("gives the primary the full width, sharing its row with nothing", async () => {
    await reachCodeStep();

    expect(primary().className).not.toContain("flex-1");

    // Direct siblings, not descendants: the form is a column, so "its row" is
    // the set of elements sitting at the primary's own level. The resend lives
    // in a wrapper below and is deliberately not counted.
    const onItsRow = [...primary().parentElement!.children].filter(
      (element) => element.tagName === "BUTTON",
    );
    expect(onItsRow).toEqual([primary()]);
  });

  // §8: back means "previous step", and it is the whole escape hatch — there is
  // no "use a different email" saying the same thing in words.
  it("returns to the email step and offers no textual escape hatch", async () => {
    const user = await reachCodeStep();

    expect(screen.queryByText(/different email/i)).toBeNull();

    await user.click(backButton());

    expect(screen.getByRole("heading", { name: "Sign in" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  // §8: one tertiary action per step, beneath the primary.
  it("keeps the resend beneath the primary", async () => {
    await reachCodeStep();

    const resend = screen.getByRole("button", { name: "Send a new code" });
    expect(resend.parentElement).not.toBe(primary().parentElement);
  });
});

describe("sign-in field language", () => {
  beforeEach(() => {
    requestCode.mockReset();
    verifyCode.mockReset();
  });

  // §8 (v2.5): one text per field. The format hint that used to sit here is
  // gone, and the sentinel is all that remains.
  it("shows the email field nothing but its label", () => {
    render(<SignInForm />);

    expect(screen.getByLabelText("Email").getAttribute("placeholder")).toBe(" ");
  });

  /**
   * §8 validation timing, at the seam the hook cannot cover on its own: an
   * outage is the server's word about a well-formed address, so clear-fast must
   * not wipe it the instant the value parses. Only a new keystroke clears it.
   */
  it("keeps a server message until the address is edited", async () => {
    requestCode.mockResolvedValue({ status: "unavailable" });
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.type(screen.getByLabelText("Email"), "someone@example.com");
    await user.click(screen.getByRole("button", { name: "Send code" }));

    const message = await screen.findByText("Sign-in is unavailable right now.");
    expect(message).not.toBeNull();

    await user.type(screen.getByLabelText("Email"), "m");
    expect(screen.queryByText("Sign-in is unavailable right now.")).toBeNull();
  });
});
