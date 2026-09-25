import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RESEND_COOLDOWN_MS } from "@/lib/motion";
import { OTP_EXPIRY_SECONDS } from "@/lib/auth/otp";

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
 * Every step change here waits on a server action, and every wait below is a
 * synchronous query straight after the click. userEvent dispatches inside
 * `act`, so by the time `user.click` resolves the transition has committed —
 * the heading, the message, the re-enabled inputs, all of it. The `findBy`
 * polls this file used to make added nothing to that except a real one-second
 * clock, and a machine running three suites at once can hold a worker past a
 * second doing nothing wrong: that was the red T0.98 filed and the one T0.9
 * reproduced. A query with no clock is the same on a slow machine.
 */

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
  screen.getByRole("heading", { name: "Enter your code" });
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

    // §8.3 (v2.21): the primary and the tertiary share a column, 8 apart, so
    // the primary's siblings stack beneath it and none sits on its row.
    expect(primary().className).toContain("w-full");
    expect(primary().parentElement!.className).toContain("flex-col");
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

    // §8 (v2.11): it opens counting down, so the label carries a clock and an
    // exact name would not match it. Where it sits is what this test is about.
    const resend = screen.getByRole("button", { name: /Send a new code/ });
    expect(
      primary().compareDocumentPosition(resend) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // §8.3: 8 from the primary to the tertiary, in one column.
    expect(resend.parentElement).toBe(primary().parentElement);
    expect(resend.parentElement!.className).toContain("gap-[8px]");
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
    const message = screen.getByText("Sign-in is unavailable right now.");
    expect(message).not.toBeNull();

    await user.type(screen.getByLabelText("Email"), "m");
    expect(screen.queryByText("Sign-in is unavailable right now.")).toBeNull();
  });
});

/**
 * §8 (v2.11) resend cooldown — when the window opens, and where a failure
 * inside it is allowed to land.
 *
 * The clock itself is proven in `useCooldown.dom.test.ts`. What only the form
 * can show is the wiring: when the window starts, which state a failed resend
 * writes to, and which control ends up wearing it.
 *
 * Fake timers throughout, because the resend is no longer live on arrival —
 * §8 starts its window with the code that got us here, so a test that wants to
 * press the control has to run that window out first. Only `setInterval` and
 * `Date` are faked, which is exactly what the hook reads: faking `setTimeout`
 * as well would stall userEvent and RTL, both of which wait on real ones.
 */
describe("sign-in resend", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    requestCode.mockReset();
    verifyCode.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  const otpGroup = () => screen.getByRole("group");
  /** The composite is label / group / helper — §8 reserves the helper line. */
  const otpHelper = () => otpGroup().parentElement!.lastElementChild!;

  const resting = () =>
    screen.queryByRole("button", { name: "Send a new code" }) as HTMLButtonElement | null;
  const cooling = () =>
    screen.queryByRole("button", {
      name: /^Send a new code \(\d:\d\d\)$/,
    }) as HTMLButtonElement | null;

  /** Reaches the code step, which is also where the window opens. */
  async function arrive() {
    requestCode.mockResolvedValue({ status: "sent" });
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.type(screen.getByLabelText("Email"), "someone@example.com");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    screen.getByRole("heading", { name: "Enter your code" });
    return user;
  }

  /** Runs a window out, so the control is pressable again. */
  const runOut = async (ms = RESEND_COOLDOWN_MS) => {
    await act(async () => {
      vi.advanceTimersByTime(ms);
    });
  };

  /**
   * §8 (v2.11), and the bug it closes. The provider's clock starts with the
   * code that reached this step, so a resend that was live on arrival could
   * only ever be refused — one tap, one error, for a control the product had
   * left enabled.
   */
  it("opens the code step already counting down", async () => {
    await arrive();

    expect(resting()).toBeNull();
    expect(cooling()).not.toBeNull();
    expect(cooling()!.disabled).toBe(true);
    // The whole window is still ahead: none of it has been spent.
    expect(cooling()!.textContent).toBe("Send a new code (1:00)");
  });

  // The window opens the control, it does not simply close it.
  it("returns to its normal label once the window is out", async () => {
    await arrive();
    await runOut();

    expect(cooling()).toBeNull();
    expect(resting()).not.toBeNull();
    expect(resting()!.disabled).toBe(false);
  });

  /**
   * §8 (v2.11): the window survives a step back — `back` does not close it,
   * because stepping back does not close the provider's. Coming forward sends a
   * new code, so the step opens on a *new* window rather than the remains of
   * the old one.
   */
  it("opens a fresh window on the way forward, not the remains of the old one", async () => {
    const user = await arrive();

    await runOut(30_000);
    expect(cooling()!.textContent).toBe("Send a new code (0:30)");

    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Send code" }));
    screen.getByRole("heading", { name: "Enter your code" });

    // A second code went out, so the clock is that code's, not the first's.
    expect(cooling()!.textContent).toBe("Send a new code (1:00)");
    expect(requestCode).toHaveBeenCalledTimes(2);
  });

  /**
   * §8 (v2.10): a field's helper line carries only errors about that field's
   * own value. A rate limit is about the request the resend made, not about the
   * six digits being typed — and it used to land on `codeError`, painting the
   * boxes red for something the person entering the code had not done.
   */
  it("puts a resend failure on the resend, never on the OTP field", async () => {
    const user = await arrive();
    await runOut();
    requestCode.mockResolvedValue({ status: "rate-limited" });

    await user.click(resting()!);

    // §12: states the cause, does not scold.
    const message = screen.getByRole("status");
    expect(message.textContent).toBe(
      "Too many requests. Wait a moment before asking for another code.",
    );

    // The boxes stay unmarked and their reserved line stays empty.
    expect(otpHelper().textContent).toBe("");
    const boxes = within(otpGroup()).getAllByRole("textbox");
    expect(boxes.some((box) => box.hasAttribute("aria-invalid"))).toBe(false);
    expect(boxes.some((box) => box.hasAttribute("aria-describedby"))).toBe(false);
  });

  // A press is a send, so it opens a window of its own.
  it("counts down again from a resend", async () => {
    const user = await arrive();
    await runOut();
    requestCode.mockResolvedValue({ status: "sent" });

    await user.click(resting()!);

    expect(resting()).toBeNull();
    expect(cooling()!.disabled).toBe(true);
  });

  /**
   * A successful resend says nothing at all: §8's helper slot speaks only in
   * states, and "it worked" is not one. The subtitle already carries where the
   * code went.
   */
  it("says nothing on a resend that works", async () => {
    const user = await arrive();
    await runOut();
    requestCode.mockResolvedValue({ status: "sent" });

    await user.click(resting()!);

    expect(screen.queryByRole("status")).toBeNull();
    expect(otpHelper().textContent).toBe("");
  });

  /**
   * §8: the cooldown is the mechanism, not advice. The second tap that used to
   * hit the provider's rate limit does not reach it at all now — which is the
   * whole reason the failure stopped needing somewhere to land.
   */
  it("refuses the second tap inside the window", async () => {
    const user = await arrive();
    await runOut();
    requestCode.mockResolvedValue({ status: "rate-limited" });

    // One call so far: the code request that reached this step.
    expect(requestCode).toHaveBeenCalledTimes(1);

    await user.click(resting()!);
    screen.getByRole("status");
    expect(requestCode).toHaveBeenCalledTimes(2);

    await user.click(cooling()!);

    // Still cooling down, so nothing new was asked for.
    expect(requestCode).toHaveBeenCalledTimes(2);
  });
});

/**
 * §12 (v2.12) — the code step's two errors, at the only place that picks
 * between them.
 *
 * `hasCodeExpired` is unit-tested as arithmetic. What this covers is the wiring
 * that arithmetic hangs off: that the send clock is actually started, actually
 * read, and that the same provider refusal produces different words depending
 * on how long the code has been sitting there. The refusal is identical in both
 * tests below — that is the point.
 */
describe("sign-in code errors", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    requestCode.mockReset();
    verifyCode.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  const WRONG = "That code isn't right. Check it, or ask for a new one.";
  const EXPIRED = "That code has expired. Ask for a new one.";

  /** Reaches the code step and types a full six digits, which self-submits. */
  async function enterCode() {
    requestCode.mockResolvedValue({ status: "sent" });
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.type(screen.getByLabelText("Email"), "someone@example.com");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    screen.getByRole("heading", { name: "Enter your code" });
    return user;
  }

  const submitCode = async (user: ReturnType<typeof userEvent.setup>) => {
    const boxes = within(screen.getByRole("group")).getAllByRole("textbox");
    await user.type(boxes[0]!, "482913");
  };

  /**
   * The bug this closes: a mistyped digit was answered with the expiry line,
   * which sends someone to their inbox to wait for a code already sitting in
   * it. The provider says `otp_expired` for a wrong code — it is the name of
   * its one refusal, not a finding about the code.
   */
  it("calls a code refused inside its window wrong, not expired", async () => {
    const user = await enterCode();
    verifyCode.mockResolvedValue({ status: "code-rejected" });

    await submitCode(user);
    expect(screen.getByText(WRONG)).not.toBeNull();
    expect(screen.queryByText(EXPIRED)).toBeNull();
  });

  it("calls the same refusal expired once the window has closed", async () => {
    const user = await enterCode();
    verifyCode.mockResolvedValue({ status: "code-rejected" });

    // The page sat open past the code's ten minutes. Same refusal, different
    // cause, and now different words.
    await act(async () => {
      vi.advanceTimersByTime(OTP_EXPIRY_SECONDS * 1000);
    });
    await submitCode(user);
    expect(screen.getByText(EXPIRED)).not.toBeNull();
    expect(screen.queryByText(WRONG)).toBeNull();
  });

  /**
   * A resend restarts the clock, so a code that arrives fresh is judged fresh
   * even on a page that has been open far longer than one code's life.
   */
  it("restarts the window on a resend, so a fresh code is judged fresh", async () => {
    const user = await enterCode();

    // Past the first code's life, so the resend is live again and anything
    // judged against the *first* send would read as expired.
    await act(async () => {
      vi.advanceTimersByTime(OTP_EXPIRY_SECONDS * 1000);
    });

    requestCode.mockResolvedValue({ status: "sent" });
    await user.click(screen.getByRole("button", { name: "Send a new code" }));
    await act(async () => {
      await Promise.resolve();
    });

    verifyCode.mockResolvedValue({ status: "code-rejected" });
    await submitCode(user);
    expect(screen.getByText(WRONG)).not.toBeNull();
    expect(screen.queryByText(EXPIRED)).toBeNull();
  });

  // Neither of the two code errors: an outage is the server's, and says so.
  it("does not dress an outage up as a bad code", async () => {
    const user = await enterCode();
    verifyCode.mockResolvedValue({ status: "unavailable" });

    await submitCode(user);
    expect(screen.getByText("Sign-in is unavailable right now.")).not.toBeNull();
    expect(screen.queryByText(WRONG)).toBeNull();
    expect(screen.queryByText(EXPIRED)).toBeNull();
  });
});

/**
 * T0.42 — design-spec v2.21 §8.2 and §8.4 on the sign-in step: C-18's submit half, C-19's
 * label shape, and where a request-level message lands.
 */
describe("sign-in forms to v2.21", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    requestCode.mockReset();
    verifyCode.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  async function arrive() {
    requestCode.mockResolvedValue({ status: "sent" });
    const user = userEvent.setup();
    render(<SignInForm />);
    await user.type(screen.getByLabelText("Email"), "someone@example.com");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    screen.getByRole("heading", { name: "Enter your code" });
    return user;
  }

  const cooling = () =>
    screen.getByRole("button", { name: /^Send a new code \(\d:\d\d\)$/ }) as HTMLButtonElement;

  // C-19: the one changing thing on the step stays readable, its time in a mono span.
  it("counts down in a readable label with the time in a mono-readout span", async () => {
    await arrive();

    const resend = cooling();
    expect(resend.disabled).toBe(true);
    const clock = resend.querySelector(".type-mono-readout");
    expect(clock?.textContent).toBe("1:00");
    // §8.4: the label stays --n-secondary while the control is disabled.
    expect(resend.className).toContain("disabled:text-n-secondary");
    expect(resend.className).not.toContain("disabled:text-n-disabled");
  });

  // §8.4's exemption is for the countdown alone: a verify in flight disables the
  // resend for a reason that carries no information, so it takes §7's tone.
  it("gives the resend §7's disabled tone while a verify is in flight", async () => {
    const user = await arrive();
    await act(async () => {
      vi.advanceTimersByTime(RESEND_COOLDOWN_MS);
    });
    // Held open for the assertion, then settled: React entangles async
    // transitions, so one left pending would hold every later test's pending too.
    let settle!: (value: { status: "unavailable" }) => void;
    verifyCode.mockReturnValue(new Promise((resolve) => (settle = resolve)));

    try {
      const boxes = within(screen.getByRole("group")).getAllByRole("textbox");
      await user.type(boxes[0]!, "482913");

      const resend = screen.getByRole("button", { name: "Send a new code" }) as HTMLButtonElement;
      expect(resend.disabled).toBe(true);
      expect(resend.className).toContain("disabled:text-n-disabled");
    } finally {
      await act(async () => settle({ status: "unavailable" }));
    }
  });

  // §8.3: the tertiary is Neutral md.
  it("draws the resend at md", async () => {
    await arrive();
    expect(cooling().className).toContain("h-[34px]");
  });

  // C-18: a submit is never disabled for an incomplete form.
  it("leaves both submits pressable while their forms are incomplete", async () => {
    await arrive();
    // The code step, no digits typed.
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Back" }));
    await userEvent.setup().clear(screen.getByLabelText("Email"));
    expect((screen.getByRole("button", { name: "Send code" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  // C-18: submit validates the empty field too, and scrolls to the first error.
  it("flags an empty field on submit and scrolls to it", async () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.click(screen.getByRole("button", { name: "Send code" }));

    const email = screen.getByLabelText("Email");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(requestCode).not.toHaveBeenCalled();
    expect(scrolled.mock.contexts).toContain(email);
  });

  // §8.2: a request-level message is not about the field's value.
  it("puts a failed send under the step's last control, never on the field", async () => {
    requestCode.mockResolvedValue({ status: "unavailable" });
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.type(screen.getByLabelText("Email"), "someone@example.com");
    await user.click(screen.getByRole("button", { name: "Send code" }));

    const message = screen.getByRole("status");
    expect(message.textContent).toBe("Sign-in is unavailable right now.");
    expect(message.className).toContain("text-n-secondary");
    expect(message.className).toContain("text-center");
    expect(screen.getByLabelText("Email").hasAttribute("aria-invalid")).toBe(false);
    // Under the last control: the primary comes before it in the document.
    const primary = screen.getByRole("button", { name: "Send code" });
    expect(
      primary.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("puts a rate limit on the code step under the last control, not on the boxes", async () => {
    const user = await arrive();
    verifyCode.mockResolvedValue({ status: "rate-limited" });

    const boxes = within(screen.getByRole("group")).getAllByRole("textbox");
    await user.type(boxes[0]!, "482913");

    const message = screen.getByRole("status");
    expect(message.textContent).toBe(
      "Too many requests. Wait a moment before asking for another code.",
    );
    expect(message.className).toContain("text-n-secondary");
    const after = within(screen.getByRole("group")).getAllByRole("textbox");
    expect(after.some((box) => box.hasAttribute("aria-invalid"))).toBe(false);
    expect(
      cooling().compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
