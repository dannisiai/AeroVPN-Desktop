import { useCallback, useEffect, useState } from "react";

import { useI18n } from "../app/i18n";
import type { AeroAccountSnapshot, DesktopHost } from "../app/desktop";
import { AeroIcon } from "../components/AeroIcon";
import aeroAvatar from "../assets/aero-avatar.png";
import styles from "./AeroPages.module.css";

const ACCOUNT_REFRESH_INTERVAL_MS = 60_000;

export function AeroAccountView(props: {
  host: DesktopHost;
  account: AeroAccountSnapshot;
  onAccountUpdated?: (account: AeroAccountSnapshot) => void;
}) {
  const { t, language } = useI18n();
  const [account, setAccount] = useState(props.account);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState("");

  useEffect(() => setAccount(props.account), [props.account]);

  const refresh = useCallback(async (showStatus = true) => {
    if (showStatus) {
      setLoading(true);
      setRefreshError("");
    }
    try {
      const updatedAccount = await props.host.auth.refreshAccount();
      setAccount(updatedAccount);
      props.onAccountUpdated?.(updatedAccount);
    } catch (error) {
      if (showStatus) setRefreshError(error instanceof Error ? error.message : String(error));
    } finally {
      if (showStatus) setLoading(false);
    }
  }, [props.host, props.onAccountUpdated]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => void refresh(false), ACCOUNT_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const plan = account.plan;
  const active = plan?.status === "active" && plan.expiresAt > Math.floor(Date.now() / 1000);
  const remainingDays = plan === null ? 0 : Math.max(0, Math.floor((plan.expiresAt * 1000 - Date.now()) / 86_400_000));
  const validUntil = plan === null || plan.expiresAt <= 0
    ? "--"
    : new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(plan.expiresAt * 1000));

  return (
    <section className={styles.page}>
      <header className={`${styles.pageHeader} ${styles.accountHeader}`}>
        <h1>{t("Account & Subscription")}</h1>
        <button type="button" className={styles.accountRefresh} disabled={loading} onClick={() => void refresh()} aria-label={t("Refresh account")}>
          <AeroIcon name="sync_rounded" size={19} />
        </button>
      </header>
      <div className={styles.accountBody}>
        <div className={styles.accountProfile}>
          <img className={styles.avatarPlaceholder} src={aeroAvatar} alt="" />
          <div className={styles.profileCopy}>
            <strong>{account.email}</strong>
            <span className={`${styles.expiredStatus} ${active ? styles.activeStatus : ""}`}>
              <i />{active ? t("Subscription active") : plan === null ? t("Not subscribed") : t("Expired")}
            </span>
          </div>
        </div>

        <h2 className={styles.sectionCaption}>{t("Current Subscription")}</h2>
        <section className={styles.subscriptionCard}>
          <div className={styles.subscriptionTitle}>
            <strong>{plan?.name || t("Not subscribed")}</strong>
            <span className={styles.daysBadge}>{active ? remainingDays : 0} {t("days left")}</span>
          </div>
          <div className={styles.subscriptionRow}>
            <span>{t("Valid until")}</span><strong>{validUntil}</strong>
          </div>
          <div className={styles.subscriptionRow}>
            <span>{t("Device limit")}</span>
            <strong>{plan?.maxDevices ?? 0}</strong>
          </div>
          {plan?.trafficGb !== null && plan?.trafficGb !== undefined && plan.trafficGb > 0 && (
            <div className={styles.subscriptionRow}>
              <span>{t("Remaining Data")}</span>
              <strong>{plan.trafficUsedGb === null ? "—" : `${Math.max(0, plan.trafficGb - plan.trafficUsedGb).toFixed(0)} GB`}</strong>
            </div>
          )}
          {!active && <div className={styles.noPlanHint}>{t("No active subscription. Please purchase a plan before connecting.")}</div>}
        </section>

        {refreshError && <div className={styles.accountError} role="status">{refreshError}</div>}
      </div>
    </section>
  );
}
