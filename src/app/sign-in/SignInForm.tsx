"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { AeMark } from "@/components/AeMark";
import { cx } from "@/lib/cx";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { OtpInput } from "@/components/ui/OtpInput";
import { ArrowLeftIcon, MailIcon } from "@/components/ui/icons";
import { OTP_BOX_COUNT, inputHelperClasses } from "@/components/ui/variants";
import { useCooldown, formatCountdown } from "@/components/ui/useCooldown";
import { useFieldValidation } from "@/components/ui/useFieldValidation";
import { isValidEmail, isValidOtp } from "@/lib/auth/otp";
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
   * Two sources, one helper line. The hook speaks about the shape of what was
   * typed and clears itself; a rate limit or an outage is the server's word
   * about a value that may be perfectly well-formed, so it is held separately
   * and cleared by the next keystroke. Folding them into one state would let
   * the hook's clear-fast rule wipe an outage message the moment the address
   * parses, which is not what it is for.
   */
  const [serverError, setServerError] = useState<string | null>(null);

  /**
   * §8 (v2.10): the resend's failures are the resend's. A helper line carries
   * only errors about its own field's value, so a rate limit — which is about
   * the request, not about the six digits being typed — surfaces at the control
   * that made it. This used to land on `codeError` and paint the OTP boxes red
   * for something the person entering the code had not done.
   */
  const [resendError, setResendError] = useState<string | null>(null);
  const resendCooldown = useCooldown();

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
    // §8: submit validates regardless of the pause or the length floor.
    if (!emailField.validateNow()) return;

    startTransition(async () => {
      const result = await requestCode(email);

      if (result.status === "invalid-email") {
        setServerError(t.signIn.emailInvalid);
        return;
      }
      if (result.status === "rate-limited") {
        setServerError(t.signIn.rateLimited);
        return;
      }
      if (result.status === "unavailable") {
        setServerError(t.signIn.unavailable);
        return;
      }

      // "sent" whether or not an account exists — same words either way.
      setServerError(null);
      emailField.clear();
      setCode("");
      setCodeError(null);
      setResendError(null);
      setNotice(t.signIn.codeSentTo(email));
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
    if (!isValidOtp(value)) {
      setCodeError(t.signIn.codeIncomplete);
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

      setCodeError(
        result.status === "expired"
          ? t.signIn.codeExpired
          : result.status === "rate-limited"
            ? t.signIn.rateLimited
            : result.status === "unavailable"
              ? t.signIn.unavailable
              : t.signIn.codeRejected,
      );
    });
  };

  const back = () => {
    setStep("email");
    setCode("");
    setCodeError(null);
    setServerError(null);
    setResendError(null);
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
    setResendError(null);
    // A press is a send, so it starts the window like any other.
    resendCooldown.start();

    startTransition(async () => {
      const result = await requestCode(email);

      if (result.status === "sent") {
        setCode("");
        setCodeError(null);
        return;
      }

      setResendError(
        result.status === "rate-limited" ? t.signIn.rateLimited : t.signIn.unavailable,
      );
    });
  };

  return (
    <div className="flex w-full max-w-[400px] flex-col gap-[24px]">
      {/* §8 (v2.7) multi-step: the Æ mark is centered above every step. A step
          with no back button centers its title and subtitle beneath the mark; a
          step with one uses the header grammar instead, where the title block
          left-aligns to itself beside the back control rather than centering.
          Step changes are instant — no slide between the two. */}
      <div className="flex flex-col gap-[8px]">
        <AeMark size={32} className="mb-[8px] self-center text-n-primary" />
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
            }}
            onBlur={emailField.onBlur}
          />

          {/* §8: the primary fills the content width alone. */}
          {providers.includes("email") ? (
            <Button type="submit" size="lg" fullWidth loading={pending}>
              {t.signIn.sendCode}
            </Button>
          ) : null}
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

          {/* §8 (v2.5): back lives in the step header now, so the primary fills
              the width alone. Back is still the whole escape hatch — there is no
              "use a different email" link saying the same thing in words. */}
          <Button type="submit" size="lg" fullWidth loading={pending}>
            {t.common.continue}
          </Button>

          {/* §8: one tertiary action per step, beneath the primary, centred.
              §8 (v2.10): it disables itself for 60s after each use and counts
              down in its own label, returning to its normal label at zero. */}
          <div className="flex flex-col items-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending || resendCooldown.active}
              onClick={resend}
            >
              {resendCooldown.active
                ? t.signIn.resendIn(formatCountdown(resendCooldown.remainingMs))
                : t.signIn.resend}
            </Button>

            {/* §8 (v2.10): a failure belonging to this control surfaces at this
                control. `role="status"` because it arrives after the press,
                with focus still on the OTP boxes — unannounced, it would be a
                message nobody driving by keyboard ever hears. Unreserved: it is
                the last thing on the step, so nothing above it can shift. */}
            {resendError ? (
              <span role="status" className={inputHelperClasses("error", false)}>
                {resendError}
              </span>
            ) : null}
          </div>
        </form>
      )}
    </div>
  );
}
