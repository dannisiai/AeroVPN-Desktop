import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";

import {
  loadAeroConnectionPreferences,
  saveAeroConnectionPreferences,
  type AeroConnectionPreferences,
} from "../app/connectionMode";
import { LanguageSelect, useI18n } from "../app/i18n";
import type { AeroConnectionMode, AeroRoutingMode, DesktopHost } from "../app/desktop";
import { showError } from "../app/errorStore";
import { AeroIcon, type AeroIconName } from "../components/AeroIcon";
import { Button, Dialog, Select } from "../components/ui";
import { AEROVPN_PRIVACY } from "./aeroPrivacy";
import { AEROVPN_TERMS, type AeroLegalSection } from "./aeroTerms";
import styles from "./AeroPages.module.css";

const AEROVPN_DISPLAY_VERSION = "1.0.0";

function LegalContent(props: { sections: readonly AeroLegalSection[] }) {
  return (
    <>
      {props.sections.map((section, sectionIndex) => (
        <section key={`${section.title}-${sectionIndex}`}>
          {section.title && <h4>{section.title}</h4>}
          {section.paragraphs?.map((paragraph, paragraphIndex) => (
            <p key={`${sectionIndex}-p-${paragraphIndex}`}>{paragraph}</p>
          ))}
          {section.bullets && (
            <ul>
              {section.bullets.map((item, itemIndex) => <li key={`${sectionIndex}-b-${itemIndex}`}>{item}</li>)}
            </ul>
          )}
          {section.numberedItems && (
            <ol>
              {section.numberedItems.map((item, itemIndex) => <li key={`${sectionIndex}-n-${itemIndex}`}>{item}</li>)}
            </ol>
          )}
          {section.trailingParagraphs?.map((paragraph, paragraphIndex) => (
            <p key={`${sectionIndex}-tail-${paragraphIndex}`}>{paragraph}</p>
          ))}
        </section>
      ))}
    </>
  );
}

export function AeroSettingsView(props: { host: DesktopHost; onLogout?: () => Promise<void> }) {
  const { t } = useI18n();
  const [openAtLogin, setOpenAtLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connectionPreferences, setConnectionPreferences] = useState<AeroConnectionPreferences>(loadAeroConnectionPreferences);
  const [connectionActive, setConnectionActive] = useState(false);
  const [dialog, setDialog] = useState<"updates" | "terms" | "privacy" | null>(null);
  const [accountDialog, setAccountDialog] = useState<"reset-password" | "logout" | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetEmailLocked, setResetEmailLocked] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [editDialog, setEditDialog] = useState<"port" | null>(null);
  const [portDraft, setPortDraft] = useState("65532");
  const [portError, setPortError] = useState("");

  const refresh = useCallback(async () => {
    const [settings, activeConnection] = await Promise.all([
      props.host.settings.get(),
      props.host.auth.activeConnection().catch(() => null),
    ]);
    setOpenAtLogin(settings.openAtLogin);
    setConnectionPreferences(loadAeroConnectionPreferences());
    setConnectionActive(activeConnection !== null);
  }, [props.host]);

  useEffect(() => { void refresh().catch(showError); }, [refresh]);

  const toggleOpenAtLogin = async () => {
    const next = !openAtLogin;
    setBusy(true);
    setOpenAtLogin(next);
    try {
      await props.host.settings.setOpenAtLogin(next);
    } catch (error) {
      setOpenAtLogin(!next);
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const updateConnectionPreferences = (patch: Partial<AeroConnectionPreferences>) => {
    const next = { ...connectionPreferences, ...patch };
    setConnectionPreferences(next);
    saveAeroConnectionPreferences(next);
  };

  const openPortDialog = () => {
    setPortDraft(String(connectionPreferences.localPort));
    setPortError("");
    setEditDialog("port");
  };

  const savePort = () => {
    const port = Number(portDraft);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535 || port === 9090) {
      setPortError(t("Enter a valid port from 1 to 65535. Port 9090 is reserved."));
      return;
    }
    updateConnectionPreferences({ localPort: port });
    setEditDialog(null);
  };

  const openPasswordReset = async () => {
    setAccountDialog("reset-password");
    setAccountBusy(true);
    setAccountError("");
    setResetEmail("");
    setResetEmailLocked(false);
    setResetCode("");
    setNewPassword("");
    setResetCodeSent(false);
    setResetSuccess(false);
    try {
      const account = await props.host.auth.refreshAccount();
      setResetEmail(account.email);
      setResetEmailLocked(true);
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : String(error));
    } finally {
      setAccountBusy(false);
    }
  };

  const requestPasswordReset = async () => {
    const email = resetEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAccountError(t("Please enter a valid email address."));
      return;
    }
    setAccountBusy(true);
    setAccountError("");
    try {
      await props.host.auth.forgotPassword(email);
      setResetCodeSent(true);
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : String(error));
    } finally {
      setAccountBusy(false);
    }
  };

  const completePasswordReset = async () => {
    if (!/^\d{6}$/.test(resetCode.trim())) {
      setAccountError(t("Enter the 6-digit reset code."));
      return;
    }
    if (newPassword.length < 8) {
      setAccountError(t("Password must be at least 8 characters."));
      return;
    }
    setAccountBusy(true);
    setAccountError("");
    try {
      await props.host.auth.resetPassword(resetEmail.trim(), resetCode.trim(), newPassword);
      setResetSuccess(true);
      setResetCode("");
      setNewPassword("");
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : String(error));
    } finally {
      setAccountBusy(false);
    }
  };

  const closeAccountDialog = () => {
    if (accountBusy) return;
    setAccountDialog(null);
    setAccountError("");
  };

  const logout = async () => {
    if (!props.onLogout) return;
    setAccountBusy(true);
    setAccountError("");
    try {
      await props.onLogout();
      setAccountDialog(null);
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : String(error));
    } finally {
      setAccountBusy(false);
    }
  };

  const connectionSettingsDisabled = busy || connectionActive;
  const row = (title: string, icon: AeroIconName, trailing: ReactNode, subtitle?: string, onClick?: () => void, disabled = false) => (
    <div
      className={`${styles.settingRow} ${onClick && !disabled ? styles.settingRowClickable : ""}`}
      onClick={onClick && !disabled ? onClick : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      aria-disabled={onClick ? disabled : undefined}
      onKeyDown={onClick ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (!disabled) onClick();
        }
      } : undefined}
    >
      <span className={styles.settingIcon}><AeroIcon name={icon} size={22} /></span>
      <span className={styles.settingCopy}><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</span>
      <span className={styles.settingTrailing}>{trailing}</span>
    </div>
  );

  const toggle = (checked: boolean, disabled: boolean, label: string, onClick: () => void) => (
    <button type="button" className={`switch ${checked ? "on" : ""}`} role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onClick} />
  );

  return (
    <section className={styles.page}>
      <header className={styles.pageHeader}><h1>{t("Settings")}</h1></header>
      <div className={styles.listBody}>
        <h2 className={styles.listSectionTitle}>{t("General")}</h2>
        <div className={styles.listCard}>
          {row(t("Language"), "language", <LanguageSelect />)}
          <div className={styles.rowDivider} />
          {row(t("Open at login"), "power_settings_new", toggle(openAtLogin, busy, t("Open at login"), () => void toggleOpenAtLogin()), t("Start the app automatically when you sign in to Windows."))}
        </div>

        <h2 className={styles.listSectionTitle}>{t("Connection Settings")}</h2>
        <div className={styles.listCard}>
          {row(
            t("Connection Mode"),
            "route",
            <Select<AeroConnectionMode>
              inline
              value={connectionPreferences.mode}
              disabled={connectionSettingsDisabled || props.host.platform !== "win32"}
              options={[
                {
                  value: "system_proxy",
                  label: t("System Proxy"),
                  description: t("System Proxy mode description"),
                },
                {
                  value: "tun",
                  label: t("Virtual Adapter"),
                  description: t("TUN mode description"),
                  separatorBefore: true,
                },
              ]}
              onChange={(mode) => updateConnectionPreferences({ mode })}
            />,
          )}
          <div className={styles.rowDivider} />
          {row(t("Local Port"), "swap_vert", <AeroIcon name="keyboard_arrow_right" size={22} />, String(connectionPreferences.localPort), openPortDialog, connectionSettingsDisabled)}
          <div className={styles.rowDivider} />
          {row(
            t("Routing Mode"),
            "tune",
            <Select<Exclude<AeroRoutingMode, "direct">>
              inline
              value={connectionPreferences.routingMode}
              disabled={connectionSettingsDisabled}
              options={[
                {
                  value: "auto",
                  label: t("Automatic mode"),
                  description: t("Automatic routing mode description"),
                },
                {
                  value: "global",
                  label: t("Global mode"),
                  description: t("Global routing mode description"),
                  separatorBefore: true,
                },
              ]}
              onChange={(routingMode) => updateConnectionPreferences({ routingMode })}
            />,
          )}
          <div className={styles.rowDivider} />
          {row(
            t("Secure Mode"),
            "shield",
            toggle(connectionPreferences.secureDns, connectionSettingsDisabled, t("Secure Mode"), () => updateConnectionPreferences({ secureDns: !connectionPreferences.secureDns })),
            t("Use Private DNS service"),
          )}
        </div>

        <h2 className={styles.listSectionTitle}>{t("Updates & Support")}</h2>
        <div className={styles.listCard}>
          {row(t("Check for Updates"), "system_update", <AeroIcon name="keyboard_arrow_right" size={22} />, undefined, () => setDialog("updates"))}
          <div className={styles.rowDivider} />
          {row(t("Terms of Service"), "description", <AeroIcon name="keyboard_arrow_right" size={22} />, undefined, () => setDialog("terms"))}
          <div className={styles.rowDivider} />
          {row(t("Privacy Policy"), "security", <AeroIcon name="keyboard_arrow_right" size={22} />, undefined, () => setDialog("privacy"))}
        </div>

        <h2 className={styles.listSectionTitle}>{t("Account Management")}</h2>
        <div className={styles.listCard}>
          {row(t("Reset Password"), "lock", <AeroIcon name="keyboard_arrow_right" size={22} />, undefined, () => void openPasswordReset())}
          {props.onLogout && (
            <>
              <div className={styles.rowDivider} />
              {row(t("Log Out"), "logout", <AeroIcon name="keyboard_arrow_right" size={22} />, undefined, () => {
                setAccountError("");
                setAccountDialog("logout");
              })}
            </>
          )}
        </div>

        <div className={styles.pageBottomSpace} />
      </div>

      {dialog !== null && (
        <Dialog onClose={() => setDialog(null)}>
          {dialog === "updates" ? (
            <>
              <h3>{t("Version Update")}</h3>
              <div className={styles.updateDialogBody}>
                <div className={styles.updateVersionCard}>
                  <AeroIcon name="info" size={36} />
                  <strong>{t("Current Version: {version}", { version: AEROVPN_DISPLAY_VERSION })}</strong>
                </div>
                <p className="dialog-message">{t("Automatic update check is not configured in this build. Please download the latest release from the official website.")}</p>
              </div>
              <div className="row-actions dialog-actions">
                <Button variant="primary" onClick={() => setDialog(null)}>{t("Confirm")}</Button>
              </div>
            </>
          ) : dialog === "terms" ? (
            <>
              <h3>{t("Terms of Service")}</h3>
              <div className={styles.legalDialogContent}>
                <LegalContent sections={AEROVPN_TERMS} />
              </div>
              <div className="row-actions dialog-actions">
                <Button variant="primary" onClick={() => setDialog(null)}>{t("Confirm")}</Button>
              </div>
            </>
          ) : (
            <>
              <h3>{t("Privacy Policy")}</h3>
              <div className={styles.legalDialogContent}>
                <LegalContent sections={AEROVPN_PRIVACY} />
              </div>
              <div className="row-actions dialog-actions">
                <Button variant="primary" onClick={() => setDialog(null)}>{t("Confirm")}</Button>
              </div>
            </>
          )}
        </Dialog>
      )}

      {editDialog !== null && (
        <Dialog onClose={() => setEditDialog(null)}>
          <>
            <h3>{t("Local Port")}</h3>
            <label className="field">
              <span className="field-label">{t("Local Port")}</span>
              <input
                autoFocus
                className="input"
                type="number"
                min={1}
                max={65535}
                step={1}
                value={portDraft}
                onChange={(event) => setPortDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") savePort();
                }}
              />
            </label>
            {portError !== "" && <p className="dialog-message" role="alert">{portError}</p>}
            <div className="row-actions dialog-actions">
              <Button onClick={() => setEditDialog(null)}>{t("Cancel")}</Button>
              <Button variant="primary" onClick={savePort}>{t("Save")}</Button>
            </div>
          </>
        </Dialog>
      )}

      {accountDialog !== null && (
        <Dialog onClose={closeAccountDialog}>
          {accountDialog === "reset-password" ? (
            <>
              <h3>{t("Reset Password")}</h3>
              <div className="dialog-message">
                <p>
                  {resetSuccess
                    ? t("Password reset successfully.")
                    : resetCodeSent
                      ? t("Enter the reset code and choose a new password.")
                      : t("Enter your registered email address to receive password reset instructions.")}
                </p>
                {!resetSuccess && (
                  <>
                    <label className="field">
                      <span className="field-label">{t("Email Address")}</span>
                      <input
                        autoFocus
                        className="input"
                        type="email"
                        value={resetEmail}
                        onChange={(event) => { setResetEmail(event.currentTarget.value); setAccountError(""); }}
                        disabled={resetCodeSent || accountBusy || resetEmailLocked}
                      />
                    </label>
                    {resetCodeSent && (
                      <>
                        <label className="field">
                          <span className="field-label">{t("6-digit reset code")}</span>
                          <input
                            autoComplete="one-time-code"
                            inputMode="numeric"
                            className="input"
                            maxLength={6}
                            value={resetCode}
                            onChange={(event) => { setResetCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 6)); setAccountError(""); }}
                            disabled={accountBusy}
                          />
                        </label>
                        <label className="field">
                          <span className="field-label">{t("New password")}</span>
                          <input
                            autoComplete="new-password"
                            type="password"
                            className="input"
                            value={newPassword}
                            onChange={(event) => { setNewPassword(event.currentTarget.value); setAccountError(""); }}
                            disabled={accountBusy}
                          />
                        </label>
                      </>
                    )}
                  </>
                )}
                {accountError && <p role="alert">{accountError}</p>}
              </div>
              <div className="row-actions dialog-actions">
                <Button disabled={accountBusy} onClick={closeAccountDialog}>{t("Cancel")}</Button>
                {resetSuccess ? (
                  <Button variant="primary" onClick={closeAccountDialog}>{t("Confirm")}</Button>
                ) : (
                  <Button
                    variant="primary"
                    disabled={accountBusy}
                    onClick={() => void (resetCodeSent ? completePasswordReset() : requestPasswordReset())}
                  >
                    {accountBusy ? t("Sending...") : resetCodeSent ? t("Reset Password") : t("Send reset code")}
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <h3>{t("Log Out")}</h3>
              <div className="dialog-message">
                <p>{t("Sign out of your AeroVPN account?")}</p>
                {accountError && <p role="alert">{accountError}</p>}
              </div>
              <div className="row-actions dialog-actions">
                <Button disabled={accountBusy} onClick={closeAccountDialog}>{t("Cancel")}</Button>
                <Button variant="danger" disabled={accountBusy} onClick={() => void logout()}>
                  {accountBusy ? t("Sending...") : t("Log Out")}
                </Button>
              </div>
            </>
          )}
        </Dialog>
      )}
    </section>
  );
}
