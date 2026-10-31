import { useEffect, useState, type FormEvent } from "react";

import { useI18n } from "../app/i18n";
import type { AeroAccountSnapshot, DesktopHost } from "../app/desktop";
import { LANGUAGES } from "../app/translations";
import type { LanguagePreference } from "../app/i18nCore";
import { Icon } from "../components/Icon";
import { Button, Dialog, Spinner } from "../components/ui";
import aeroLogo from "../assets/aero-logo.png";
import styles from "./AeroLoginView.module.css";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function EmailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6.75A1.75 1.75 0 0 1 4.75 5h14.5A1.75 1.75 0 0 1 21 6.75v10.5A1.75 1.75 0 0 1 19.25 19H4.75A1.75 1.75 0 0 1 3 17.25V6.75Zm1.8.07 7.2 5.5 7.2-5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 10h14v11H5V10Zm3 0V7a4 4 0 1 1 8 0v3m-4 4v3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AeroLoginView(props: {
  host: DesktopHost;
  initialError?: string | null;
  onAuthenticated: (account: AeroAccountSnapshot) => void;
}) {
  const { t, language, preference, setPreference } = useI18n();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState(props.initialError ?? "");
  const [notice, setNotice] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [forgotCodeSent, setForgotCodeSent] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);

  useEffect(() => {
    if (countdown === 0) {
      return;
    }
    const timer = window.setTimeout(() => setCountdown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    if (props.initialError) {
      setError(props.initialError);
    }
  }, [props.initialError]);

  function validEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  async function sendCode() {
    const normalizedEmail = email.trim();
    setError("");
    setNotice("");
    if (!validEmail(normalizedEmail)) {
      setError(t("Please enter a valid email address."));
      return;
    }
    setBusy(true);
    try {
      await props.host.auth.sendVerificationCode(normalizedEmail);
      setCountdown(60);
      setNotice(t("Verification code sent to your email."));
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const normalizedEmail = email.trim();
    if (!validEmail(normalizedEmail)) {
      setError(t("Please enter a valid email address."));
      return;
    }
    if (password.trim() === "") {
      setError(t("Please enter your email and password."));
      return;
    }
    if (isSignUp && password.length < 8) {
      setError(t("Password must be at least 8 characters."));
      return;
    }
    if (isSignUp && !/^\d{6}$/.test(code.trim())) {
      setError(t("Enter the 6-digit verification code."));
      return;
    }

    setBusy(true);
    try {
      if (isSignUp) {
        await props.host.auth.register(normalizedEmail, password.trim(), code.trim());
      }
      const account = await props.host.auth.login(normalizedEmail, password.trim());
      props.onAuthenticated(account);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function requestPasswordReset() {
    const normalizedEmail = forgotEmail.trim();
    if (!validEmail(normalizedEmail)) {
      setError(t("Please enter a valid email address."));
      setForgotOpen(false);
      return;
    }
    setForgotBusy(true);
    try {
      await props.host.auth.forgotPassword(normalizedEmail);
      setForgotCodeSent(true);
      setNotice("");
      setError("");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setForgotBusy(false);
    }
  }

  async function completePasswordReset() {
    if (!/^\d{6}$/.test(forgotCode.trim())) {
      setError(t("Enter the 6-digit reset code."));
      return;
    }
    if (newPassword.length < 8) {
      setError(t("Password must be at least 8 characters."));
      return;
    }
    setForgotBusy(true);
    setError("");
    try {
      await props.host.auth.resetPassword(forgotEmail.trim(), forgotCode.trim(), newPassword);
      setForgotOpen(false);
      setForgotCode("");
      setNewPassword("");
      setForgotCodeSent(false);
      setNotice(t("Password reset successfully."));
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setForgotBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.languageRow}>
        <label className={styles.languageControl}>
          <Icon name="language" size={18} />
          <select
            aria-label={t("Language")}
            value={preference === "auto" ? language : preference}
            onChange={(event) => setPreference(event.currentTarget.value as LanguagePreference)}
          >
            {LANGUAGES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </select>
        </label>
      </div>

      <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
        <div className={styles.brandMark}><img src={aeroLogo} alt="AeroVPN" /></div>
        <h1>AeroVPN</h1>
        <p className={styles.subtitle}>{t("High-speed, encrypted, zero-logs VPN network")}</p>

        <div className={styles.modeSwitch} role="tablist" aria-label={t("Authentication")}>
          <button
            type="button"
            role="tab"
            aria-selected={!isSignUp}
            className={!isSignUp ? styles.modeSelected : ""}
            onClick={() => { setIsSignUp(false); setError(""); setNotice(""); }}
          >
            {t("Sign In")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isSignUp}
            className={isSignUp ? styles.modeSelected : ""}
            onClick={() => { setIsSignUp(true); setError(""); setNotice(""); }}
          >
            {t("Create Account")}
          </button>
        </div>

        <label className={styles.field}>
          <span className={styles.srOnly}>{t("Email Address")}</span>
          <span className={styles.inputWrap}>
            <EmailIcon />
            <input
              autoComplete="email"
              autoFocus
              type="email"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
              placeholder={t("Email Address")}
              disabled={busy}
            />
          </span>
        </label>

        {isSignUp && (
          <label className={styles.field}>
            <span className={styles.srOnly}>{t("Email verification code")}</span>
            <span className={styles.codeRow}>
              <span className={styles.inputWrap}>
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder={t("6-digit code")}
                  disabled={busy}
                />
              </span>
              <button
                className={styles.codeButton}
                type="button"
                disabled={busy || countdown > 0}
                onClick={() => void sendCode()}
              >
                {busy ? t("Sending...") : countdown > 0 ? t("Resend in {seconds}s", { seconds: countdown }) : t("Get verification code")}
              </button>
            </span>
          </label>
        )}

        <label className={styles.field}>
          <span className={styles.srOnly}>{t("Login password")}</span>
          <span className={styles.inputWrap}>
            <LockIcon />
            <input
              autoComplete={isSignUp ? "new-password" : "current-password"}
              type={passwordVisible ? "text" : "password"}
              value={password}
              placeholder={t("Login password")}
              onChange={(event) => setPassword(event.currentTarget.value)}
              disabled={busy}
            />
            <button
              className={styles.passwordToggle}
              type="button"
              aria-label={passwordVisible ? t("Hide password") : t("Show password")}
              onClick={() => setPasswordVisible((current) => !current)}
            >
              <Icon name={passwordVisible ? "visibility_off" : "visibility"} size={19} />
            </button>
          </span>
        </label>

        {!isSignUp && (
          <button
            className={styles.forgotButton}
            type="button"
            onClick={() => {
              setForgotEmail(email);
              setForgotCode("");
              setNewPassword("");
              setForgotCodeSent(false);
              setError("");
              setNotice("");
              setForgotOpen(true);
            }}
          >
            {t("Forgot Password?")}
          </button>
        )}

        {error && <div className={styles.errorMessage} role="alert">{error}</div>}
        {notice && <div className={styles.successMessage} role="status">{notice}</div>}

        <Button variant="primary" type="submit" className={styles.submitButton} disabled={busy}>
          {busy ? <><Spinner className={styles.buttonSpinner} />{isSignUp ? t("Sending...") : t("Logging in...")}</> : isSignUp ? t("Create Account") : t("Sign In")}
        </Button>
      </form>

      {forgotOpen && (
        <Dialog onClose={() => setForgotOpen(false)}>
          <h2>{t("Forgot Password?")}</h2>
          <div className="dialog-message">
            <p>{forgotCodeSent ? t("Enter the reset code and choose a new password.") : t("Enter your registered email address to receive password reset instructions.")}</p>
            <label className={styles.forgotField}>
              <span>{t("Email Address")}</span>
              <input
                autoFocus
                type="email"
                value={forgotEmail}
                onChange={(event) => setForgotEmail(event.currentTarget.value)}
                disabled={forgotCodeSent || forgotBusy}
              />
            </label>
            {forgotCodeSent && (
              <>
                <label className={styles.forgotField}>
                  <span>{t("6-digit reset code")}</span>
                  <input
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={6}
                    value={forgotCode}
                    onChange={(event) => setForgotCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 6))}
                    disabled={forgotBusy}
                  />
                </label>
                <label className={styles.forgotField}>
                  <span>{t("New password")}</span>
                  <input
                    autoComplete="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.currentTarget.value)}
                    disabled={forgotBusy}
                  />
                </label>
              </>
            )}
            {error && <p role="alert">{error}</p>}
          </div>
          <div className="row-actions dialog-actions">
            <Button onClick={() => { setForgotOpen(false); setError(""); }}>{t("Cancel")}</Button>
            <Button
              variant="primary"
              disabled={forgotBusy}
              onClick={() => void (forgotCodeSent ? completePasswordReset() : requestPasswordReset())}
            >
              {forgotBusy ? t("Sending...") : forgotCodeSent ? t("Reset Password") : t("Send reset code")}
            </Button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
