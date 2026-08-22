"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { AeMark } from "@/components/AeMark";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OtpInput } from "@/components/ui/OtpInput";
import { MailIcon } from "@/components/ui/icons";
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

  return (
    <div className="flex w-full max-w-[400px] flex-col gap-[24px]">
      <div className="flex flex-col items-center gap-[16px] text-center">
        <AeMark size={32} className="text-n-primary" />
        <h1 className="type-display-lg text-n-primary">
          {step === "email" ? t.signIn.title : t.signIn.codeTitle}
        </h1>
        {step === "code" && notice ? (
          <p className="type-ui-footnote text-n-secondary">{notice}</p>
        ) : null}
      </div>

      {step === "email" ? (
        <form className="flex flex-col gap-[16px]" onSubmit={onEmailSubmit} noValidate>
          <Input
            type="email"
            name="email"
            autoComplete="email"
            autoFocus
            label={t.signIn.emailLabel}
            placeholder={t.signIn.emailPlaceholder}
            helper={emailError ?? t.signIn.emailHelper}
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
            helper={codeError ?? t.signIn.codeHelper}
            invalid={codeError !== null}
            disabled={pending}
            value={code}
            onValueChange={(next) => {
              setCode(next);
              if (codeError !== null && next.length < OTP_BOX_COUNT) setCodeError(null);
            }}
            onComplete={submitCode}
          />

          <Button type="submit" size="lg" fullWidth loading={pending}>
            {t.common.continue}
          </Button>

          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                setStep("email");
                setCode("");
                setCodeError(null);
                setNotice(null);
              }}
            >
              {t.signIn.useAnotherEmail}
            </Button>
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
