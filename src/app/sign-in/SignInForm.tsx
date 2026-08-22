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
 * Validation timing is design-spec.md §8: on blur, then on change once a field
 * has errored, never on the first keystroke.
 */
export function SignInForm() {
  const t = getDictionary();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Only email is on today; Google and Apple are declared-but-disabled, so this
  // renders one control and no dead buttons.
  const providers = enabledProviders();

  const validateEmail = (value: string) => {
    const message = isValidEmail(value) ? null : t.signIn.emailInvalid;
    setEmailError(message);
    return message === null;
  };

  const onEmailSubmit = (event: FormEvent) => {
    event.preventDefault();
    setEmailTouched(true);
    if (!validateEmail(email)) return;

    startTransition(async () => {
      const result = await requestCode(email);

      if (result.status === "invalid-email") {
        setEmailError(t.signIn.emailInvalid);
        return;
      }
      if (result.status === "rate-limited") {
        setEmailError(t.signIn.rateLimited);
        return;
      }
      if (result.status === "unavailable") {
        setEmailError(t.signIn.unavailable);
        return;
      }

      // "sent" whether or not an account exists — same words either way.
      setEmailError(null);
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
  };

  return (
    <div className="flex w-full max-w-[400px] flex-col gap-[24px]">
      {/* §8 multi-step: title → subtitle → controls → action row. Step changes
          are instant — no slide transition between the two. */}
      <div className="flex flex-col items-center gap-[8px] text-center">
        <AeMark size={32} className="mb-[8px] text-n-primary" />
        <h1 className="type-display-lg text-n-primary">
          {step === "email" ? t.signIn.title : t.signIn.codeTitle}
        </h1>
        {/* §4 subtitle slot: ui-body, --n-secondary, 8 below the title, one
            line, truncates rather than wraps. This is where the instruction
            lives now — it is no longer a helper line under the field. */}
        <p className="type-ui-body w-full truncate text-n-secondary">
          {step === "email" ? t.signIn.emailSubtitle : (notice ?? t.signIn.codeSubtitle)}
        </p>
      </div>

      {step === "email" ? (
        <form className="flex flex-col gap-[16px]" onSubmit={onEmailSubmit} noValidate>
          <Input
            type="email"
            name="email"
            autoComplete="email"
            autoFocus
            label={t.signIn.emailLabel}
            hint={t.signIn.emailHint}
            helper={emailError ?? undefined}
            invalid={emailError !== null}
            value={email}
            leadingIcon={<MailIcon />}
            disabled={pending}
            onChange={(event) => {
              setEmail(event.target.value);
              // §8: re-validate on change only after the field has errored.
              if (emailError !== null) validateEmail(event.target.value);
            }}
            onBlur={() => {
              setEmailTouched(true);
              if (emailTouched || email.length > 0) validateEmail(email);
            }}
          />

          {/* §8 action row. Step one has no previous step, so no back control —
              the primary fills the row on its own. */}
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

          {/* §8 action row: IconButton ghost 48 with arrow-left on the left,
              gap 8, primary fills the rest. Back means "previous step" — it is
              the whole escape hatch, so there is no "use a different email"
              link saying the same thing in words. */}
          <div className="flex items-center gap-[8px]">
            <IconButton
              type="button"
              variant="ghost"
              size="lg"
              label={t.common.back}
              icon={<ArrowLeftIcon />}
              disabled={pending}
              onClick={back}
            />
            <Button type="submit" size="lg" className="flex-1" loading={pending}>
              {t.common.continue}
            </Button>
          </div>

          {/* §8: one tertiary action per step, beneath the action row, centred. */}
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
