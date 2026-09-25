"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";

import { AeMark } from "@/components/AeMark";
import { cx } from "@/lib/cx";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { OtpInput } from "@/components/ui/OtpInput";
import { ArrowLeftIcon, MailIcon } from "@/components/ui/icons";
import { OTP_BOX_COUNT, REQUEST_MESSAGE_CLASSES } from "@/components/ui/variants";
import { useCooldown, formatCountdown } from "@/components/ui/useCooldown";
import { useFieldValidation } from "@/components/ui/useFieldValidation";
import { hasCodeExpired, isValidEmail, isValidOtp } from "@/lib/auth/otp";
import { enabledProviders } from "@/lib/auth/providers";
import { getDictionary } from "@/i18n";

import { requestCode, verifyCode } from "./actions";

type Step = "email" | "code";

/**
 * Email one-time-code sign-in (product-spec.md §12).
 *
 * Two steps on one route rather than two routes: the email is state the second
 * step needs, and a page reload between them would lose it or force it into a
 * query string where it does not belong.
 *
 * Validation timing is design-spec.md §8 (v2.5) — flag slow, clear fast — and
 * lives in `useFieldValidation` rather than here: this form is its first
 * consumer, not its owner.
 */
export function SignInForm() {
  const t = getDictionary();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * The server's word that the address itself is malformed. Held apart from the
   * hook's own message so the hook's clear-fast rule cannot wipe it, and cleared
   * by the next keystroke instead.
   */
  const [serverError, setServerError] = useState<string | null>(null);

  /**
   * §8.2 (v2.21): a request-level message — a rate limit, an outage, a send
   * that failed — is about no field's value, so it renders in one slot under
   * the step's last control and never on a helper line. One slot per step:
   * the send's, the verify's and the resend's failures all land here.
   */
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const resendCooldown = useCooldown();

  /** §8.2: submit scrolls to the first error, so the field has to be reachable. */
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLDivElement>(null);

  /**
   * When the code on screen went out, in epoch ms.
   *
   * §12 (v2.12) needs the code step's two errors kept apart, and the provider
   * will not keep them apart for us: a wrong code and a stale one come back as
   * the same refusal. This is the missing half — we know when we sent it, so we
   * know whether the window has closed. A ref rather than state because nothing
   * renders from it; it is read once, inside the handler that got the refusal.
   */
  const codeSentAt = useRef<number | null>(null);

  // Only email is on today; Google and Apple are declared-but-disabled, so this
  // renders one control and no dead buttons.
  const providers = enabledProviders();

  const emailField = useFieldValidation({
    value: email,
    validate: (value) => (isValidEmail(value) ? null : t.signIn.emailInvalid),
  });
  const emailError = serverError ?? emailField.error;

  const onEmailSubmit = (event: FormEvent) => {
    event.preventDefault();
    setServerError(null);
    setRequestMessage(null);
    // §8: submit validates regardless of the pause or the length floor, and
    // scrolls to the first error — here the only field there is.
    if (!emailField.validateNow()) {
      emailRef.current?.scrollIntoView({ block: "nearest" });
      return;
    }

    startTransition(async () => {
      const result = await requestCode(email);

      if (result.status === "invalid-email") {
        setServerError(t.signIn.emailInvalid);
        return;
      }
      if (result.status === "rate-limited") {
        setRequestMessage(t.signIn.rateLimited);
        return;
      }
      if (result.status === "unavailable") {
        setRequestMessage(t.signIn.unavailable);
        return;
      }

      // "sent" whether or not an account exists — same words either way.
      setServerError(null);
      emailField.clear();
      setCode("");
      setCodeError(null);
      setRequestMessage(null);
      setNotice(t.signIn.codeSentTo(email));
      codeSentAt.current = Date.now();
      /**
       * §8 (v2.11): the clock starts with the send, not with the control. This
       * code is the one that just went out, so the step opens already counting
       * down — the provider's window belongs to the address, and a resend that
       * was live on arrival handed over a tap that could only be refused.
       */
      resendCooldown.start();
      setStep("code");
    });
  };

  const submitCode = (value: string) => {
    setRequestMessage(null);
    if (!isValidOtp(value)) {
      setCodeError(t.signIn.codeIncomplete);
      codeRef.current?.scrollIntoView({ block: "nearest" });
      return;
    }

    startTransition(async () => {
      const result = await verifyCode(email, value);

      if (result.status === "verified") {
        // A full navigation, not a client transition: the session cookie was
        // set on the server and the proxy has to see it.
        router.replace("/app");
        router.refresh();
        return;
      }

      if (result.status === "rate-limited") {
        setRequestMessage(t.signIn.rateLimited);
        return;
      }
      if (result.status === "unavailable") {
        setRequestMessage(t.signIn.unavailable);
        return;
      }

      /**
       * §12 (v2.12): wrong and expired are two errors, and the provider hands
       * back one. The send clock is what tells them apart — inside the window
       * the code is still good, so a refusal means the digits were wrong.
       *
       * With no recorded send (which should not happen: the step is only
       * reachable through one) the wrong-code line is the safer of the two.
       * "Check it" costs a glance; "it expired" costs a trip to the inbox for a
       * code that is already sitting there.
       */
      const sentAt = codeSentAt.current;
      setCodeError(
        sentAt !== null && hasCodeExpired(sentAt, Date.now())
          ? t.signIn.codeExpired
          : t.signIn.codeRejected,
      );
    });
  };

  const back = () => {
    setStep("email");
    setCode("");
    setCodeError(null);
    setServerError(null);
    setRequestMessage(null);
    // The cooldown deliberately survives the step change: it tracks the
    // provider's window, and that window does not close because someone stepped
    // back. Coming forward sends a new code, which starts a new one.
  };

  /**
   * §8 (v2.10): the cooldown starts on the press, not on the reply. In between
   * is exactly where the second tap used to land — and a control that cannot
   * succeed yet is disabled, never merely apologised for.
   */
  const resend = () => {
    setRequestMessage(null);
    // A press is a send, so it starts the window like any other.
    resendCooldown.start();

    startTransition(async () => {
      const result = await requestCode(email);

      if (result.status === "sent") {
        setCode("");
        setCodeError(null);
        codeSentAt.current = Date.now();
        return;
      }

      setRequestMessage(
        result.status === "rate-limited" ? t.signIn.rateLimited : t.signIn.unavailable,
      );
    });
  };

  /**
   * §8.2: the step's one request-level slot, under its last control. `status`
   * because it arrives after a press with focus still elsewhere — unannounced,
   * nobody driving by keyboard would hear it. Unreserved: it is the last thing
   * on the step, so nothing beneath it can shift.
   */
  const requestSlot = requestMessage ? (
    <span role="status" className={REQUEST_MESSAGE_CLASSES}>
      {requestMessage}
    </span>
  ) : null;

  return (
    <div className="flex w-full max-w-[400px] flex-col gap-[24px]">
      {/* §8.3 multi-step: the Æ mark 32 is centered above every step, 24 above
          the title block, and the title block sits 24 above the first label
          zone. A step with no back button centers its title and subtitle
          beneath the mark; a step with one uses the header grammar instead,
          where the title block left-aligns to itself beside the back control.
          Step changes are instant — no slide between the two. */}
      <div className="flex flex-col gap-[24px]">
        <AeMark size={32} className="self-center text-n-primary" />
        {/* Back on the left whenever a previous step exists, gap 12, the title
            block beside it. Back and title share a first line; `items-start` is
            what keeps them sharing it once the title block is two lines tall. */}
        <div className="flex items-start gap-[12px]">
          {step === "code" ? (
            <IconButton
              type="button"
              variant="neutral"
              size="lg"
              label={t.common.back}
              icon={<ArrowLeftIcon />}
              disabled={pending}
              onClick={back}
              // §8 (v2.7): neutral paints a visible --surface-2 circle, so the
              // control has an edge of its own and sits on the column edge. The
              // v2.5 optical pull existed only because ghost had none.
              className="shrink-0"
            />
          ) : null}
          <div
            className={cx(
              "flex min-w-0 flex-1 flex-col gap-[8px]",
              // §8 (v2.7): centered only where there is no back control to
              // center it against.
              step === "email" && "text-center",
            )}
          >
            <h1 className="type-display-lg text-n-primary">
              {step === "email" ? t.signIn.title : t.signIn.codeTitle}
            </h1>
            {/* §4 subtitle slot: ui-body, --n-secondary, 8 below the title, one
                line, truncates rather than wraps. This is where the instruction
                lives now — it is no longer a helper line under the field. */}
            <p className="type-ui-body truncate text-n-secondary">
              {step === "email" ? t.signIn.emailSubtitle : (notice ?? t.signIn.codeSubtitle)}
            </p>
          </div>
        </div>
      </div>

      {step === "email" ? (
        <form className="flex flex-col gap-[16px]" onSubmit={onEmailSubmit} noValidate>
          <Input
            ref={emailRef}
            type="email"
            name="email"
            autoComplete="email"
            autoFocus
            label={t.signIn.emailLabel}
            helper={emailError ?? undefined}
            invalid={emailError !== null}
            value={email}
            leadingIcon={<MailIcon />}
            disabled={pending}
            onChange={(event) => {
              setEmail(event.target.value);
              // The hook clears its own message; what the server said about the
              // last address is only cleared by typing a different one.
              if (serverError !== null) setServerError(null);
              if (requestMessage !== null) setRequestMessage(null);
            }}
            onBlur={emailField.onBlur}
          />

          {/* §8: the primary fills the content width alone. §8.2: it is never
              disabled for an incomplete form — pressing it is how the person
              learns what is missing. */}
          <div className="flex flex-col gap-[8px]">
            {providers.includes("email") ? (
              <Button type="submit" size="lg" fullWidth loading={pending}>
                {t.signIn.sendCode}
              </Button>
            ) : null}
            {requestSlot}
          </div>
        </form>
      ) : (
        <form
          className="flex flex-col gap-[16px]"
          onSubmit={(event) => {
            event.preventDefault();
            submitCode(code);
          }}
          noValidate
        >
          <div ref={codeRef}>
            <OtpInput
              autoFocus
              label={t.signIn.codeLabel}
              helper={codeError ?? undefined}
              invalid={codeError !== null}
              disabled={pending}
              value={code}
              onValueChange={(next) => {
                setCode(next);
                if (codeError !== null && next.length < OTP_BOX_COUNT) setCodeError(null);
              }}
              onComplete={submitCode}
            />
          </div>

          {/* §8 (v2.5): back lives in the step header now, so the primary fills
              the width alone. Back is still the whole escape hatch — there is no
              "use a different email" link saying the same thing in words.
              §8.3: 8 from the primary to the tertiary. */}
          <div className="flex flex-col items-center gap-[8px]">
            <Button type="submit" size="lg" fullWidth loading={pending}>
              {t.common.continue}
            </Button>

            {/* §8.3: one tertiary action per step, beneath the primary, centred,
                Neutral md — the same variant as back, so the two read as one
                family, and ghost would vanish exactly when a disabled,
                counting-down tertiary has the most to say. §8.4: disabled for
                60s from the send, counting down in its own label; the label
                stays --n-secondary and the time is a mono-readout span. */}
            <Button
              type="button"
              variant="neutral"
              size="md"
              readableWhenDisabled
              disabled={pending || resendCooldown.active}
              onClick={resend}
            >
              {resendCooldown.active ? (
                // One inline run, so the Button's flex row does not pull the parts
                // apart with its gap.
                <span>
                  {t.signIn.resendIn(
                    <span key="clock" className="type-mono-readout">
                      {formatCountdown(resendCooldown.remainingMs)}
                    </span>,
                  )}
                </span>
              ) : (
                t.signIn.resend
              )}
            </Button>
            {requestSlot}
          </div>
        </form>
      )}
    </div>
  );
}
