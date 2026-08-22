"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { AeMark } from "@/components/AeMark";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { OtpInput } from "@/components/ui/OtpInput";
import { ArrowLeftIcon, MailIcon } from "@/components/ui/icons";
import { OTP_BOX_COUNT } from "@/components/ui/variants";
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
      setNotice(t.signIn.codeSentTo(email));
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
  };

  return (
    <div className="flex w-full max-w-[400px] flex-col gap-[24px]">
      {/* §8 (v2.5) multi-step: step header → controls → primary, all on one
          left edge. Step changes are instant — no slide between the two. */}
      <div className="flex flex-col gap-[8px]">
        <AeMark size={32} className="mb-[8px] text-n-primary" />
        {/* The step header is the mobile-navigation grammar: back on the left
            whenever a previous step exists, gap 12, the title block beside it.
            Back and title share a first line; `items-start` is what keeps them
            sharing it once the title block is two lines tall. */}
        <div className="flex items-start gap-[12px]">
          {step === "code" ? (
            <IconButton
              type="button"
              variant="ghost"
              size="lg"
              label={t.common.back}
              icon={<ArrowLeftIcon />}
              disabled={pending}
              onClick={back}
              // The 48 box pads the glyph by 12, so its optical left edge sits
              // 12 in from the column. Pulling the button back by that much is
              // what puts the arrow on the same edge as everything below it.
              className="-ml-[12px] shrink-0"
            />
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
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

          {/* §8: one tertiary action per step, beneath the primary, centred. */}
          <div className="flex justify-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await requestCode(email);
                  setCodeError(
                    result.status === "rate-limited"
                      ? t.signIn.rateLimited
                      : result.status === "sent"
                        ? null
                        : t.signIn.unavailable,
                  );
                  if (result.status === "sent") setCode("");
                })
              }
            >
              {t.signIn.resend}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
