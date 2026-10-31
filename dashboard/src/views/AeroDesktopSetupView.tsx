import { useEffect, useState } from "react";

import type { AeroAccountSnapshot, AeroRegionSnapshot, DaemonConnectionState, DesktopHost } from "../app/desktop";
import { navigate } from "../app/context";
import { displayedLatencyMs, useUsNodeLatency } from "../app/displayedLatency";
import { useI18n } from "../app/i18n";
import { nodeNumberForCity } from "../app/regionNodes";
import { AeroIcon } from "../components/AeroIcon";
import { Button, Dialog, Spinner } from "../components/ui";
import aeroLogo from "../assets/aero-logo.png";
import { AeroAccountView } from "./AeroAccountView";
import { AeroMoreView } from "./AeroMoreView";
import { AeroSettingsView } from "./AeroSettingsView";
import { AeroFaqView } from "./AeroFaqView";
import { AeroSidebar, type AeroSidebarPage } from "./AeroSidebar";
import { ProfileCard } from "./ProfileViews";
import homeStyles from "./AeroHomeView.module.css";
import pageStyles from "./AeroPages.module.css";
import styles from "./AeroDesktopSetupView.module.css";

export function AeroDesktopSetupView(props: {
  host: DesktopHost;
  state: DaemonConnectionState;
  page: string;
  account: AeroAccountSnapshot;
  onAccountUpdated?: (account: AeroAccountSnapshot) => void;
  onLogout: () => Promise<void>;
}) {
  const { t } = useI18n();
  const usNodeLatency = useUsNodeLatency();
  const [repairing, setRepairing] = useState(false);
  const [repairError, setRepairError] = useState<string | null>(null);
  const [confirmingTakeOver, setConfirmingTakeOver] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [regions, setRegions] = useState<AeroRegionSnapshot[]>([]);
  const page = props.page;
  const activePage: AeroSidebarPage = page === "account" ? "store" : page.startsWith("settings") ? "settings" : page.startsWith("tools") ? "more" : "home";

  useEffect(() => {
    let disposed = false;
    void props.host.auth.getRegions().then((value) => {
      if (!disposed) setRegions(value);
    }).catch(() => {});
    return () => { disposed = true; };
  }, [props.host]);

  const setupRegion = regions.find((region) => region.recommended) ?? regions[0] ?? null;
  const setupCity = setupRegion?.cities[0] ?? null;
  const setupLatency = setupRegion !== null && setupCity !== null
    ? displayedLatencyMs(setupRegion, setupCity, usNodeLatency)
    : null;
  const setupNodeNumber = nodeNumberForCity(regions, setupRegion?.id ?? null, setupCity?.id ?? null);
  const plan = props.account.plan;
  const planActive = plan?.status === "active" && plan.expiresAt > Math.floor(Date.now() / 1000);
  const remainingDays = planActive && plan !== null
    ? Math.max(0, Math.floor((plan.expiresAt * 1000 - Date.now()) / 86_400_000))
    : 0;
  const trafficRemaining = !planActive || plan?.trafficGb === null || plan === null
    ? "—"
    : plan.trafficGb <= 0
      ? t("Unlimited")
      : plan.trafficUsedGb === null
        ? "—"
        : `${Math.max(0, plan.trafficGb - plan.trafficUsedGb).toFixed(0)} GB`;

  const runRepair = (repair: () => Promise<unknown>, onSuccess?: () => void) => {
    setRepairing(true);
    setRepairError(null);
    repair()
      .then(onSuccess)
      .catch((error: unknown) => setRepairError(error instanceof Error ? error.message : String(error)))
      .finally(() => setRepairing(false));
  };

  let title: string;
  switch (props.state.phase) {
    case "connecting": title = t("Connecting..."); break;
    case "not-installed": title = t("The AeroVPN service is not installed"); break;
    case "not-running": title = t("The AeroVPN service is not running"); break;
    case "owned-by-other-user": title = t("AeroVPN is being used by another user"); break;
    case "version-mismatch": title = t("Incompatible service version"); break;
    default: title = t("Cannot connect to the AeroVPN service"); break;
  }

  const runPrimaryAction = () => {
    if (props.state.phase === "not-installed" || props.state.phase === "version-mismatch") {
      runRepair(props.host.setup.repairInstall);
    } else if (props.state.phase === "not-running") {
      runRepair(props.host.setup.repairStart);
    } else if (props.state.phase === "owned-by-other-user") {
      setConfirmingTakeOver(true);
    } else {
      props.host.daemon.retryConnection();
    }
  };

  const renderHome = () => (
    <section className={homeStyles.page}>
      <div className={homeStyles.topBar}>
        <button type="button" className={homeStyles.faqButton} aria-label={t("FAQ")} title={t("FAQ")} onClick={() => navigate("faq")}>
          <AeroIcon name="help_outline_rounded" size={24} />
        </button>
      </div>
      <div className={homeStyles.centerArea}>
        <div className={homeStyles.connectControl}>
          <button type="button" className={`${homeStyles.connectButton} ${props.state.phase === "connecting" ? homeStyles.connecting : ""}`} disabled>
            {props.state.phase === "connecting" ? <span className={homeStyles.spinner} /> : <img className={homeStyles.connectLogo} src={aeroLogo} alt="AeroVPN" />}
          </button>
          <span className={homeStyles.connectLabel}>{t("Install AeroVPN to connect")}</span>
        </div>
      </div>
      <div className={homeStyles.bottomSection}>
        <div className={homeStyles.serverCard}>
          <span className={homeStyles.flagAvatar} aria-hidden="true">{setupRegion?.flagEmoji ?? "🌐"}</span>
          <span className={homeStyles.locationDetails}>
            <span className={homeStyles.locationTitle}><strong>{setupCity ? t("Node {number}", { number: setupNodeNumber ?? 1 }) : t("Choose a region")}</strong><span>{setupRegion?.name ?? t("Loading...")}</span></span>
            <span className={homeStyles.latency}><span className={`${homeStyles.latencyDot} ${setupLatency === null || setupLatency <= 0 ? homeStyles.latencyDotUnavailable : setupLatency >= 100 ? homeStyles.latencyDotWarning : ""}`} />{setupLatency !== null ? `${setupLatency} ms` : "—"}</span>
          </span>
        </div>
        <section className={homeStyles.planCard} aria-label={t("Plan status")}>
          <div className={homeStyles.planColumn}>
            <span className={`${homeStyles.planIcon} ${homeStyles.planIconCloud}`}><AeroIcon name="cloud_outlined" size={24} /></span>
            <strong>{planActive ? plan?.name || t("Active subscription") : t("Not subscribed")}</strong><span className={homeStyles.planCaption}>{t("Plan Tier")}</span>
          </div>
          <span className={homeStyles.divider} />
          <div className={homeStyles.planColumn}>
            <span className={`${homeStyles.planIcon} ${homeStyles.planIconTime}`}><AeroIcon name="access_time_rounded" size={24} /></span>
            <strong>{remainingDays} {t("days")}</strong><span className={homeStyles.planCaption}>{planActive ? t("Days remaining") : t("Plan expired")}</span>
          </div>
          <span className={homeStyles.divider} />
          <div className={homeStyles.planColumn}>
            <span className={`${homeStyles.planIcon} ${homeStyles.planIconTraffic}`}><AeroIcon name="sync_rounded" size={24} /></span>
            <strong>{trafficRemaining}</strong><span className={homeStyles.planCaption}>{t("Remaining Data")}</span>
          </div>
        </section>
        <div className={styles.setupNotice}>
          <span className={styles.setupNoticeIcon}><AeroIcon name="cloud_outlined" size={21} /></span>
          <div className={styles.setupNoticeText}>
            <strong>{title}</strong>
            <span>{t("The AeroVPN interface is ready. Install the local AeroVPN service to enable connections.")}</span>
            {(repairError ?? props.state.errorMessage) && <small>{repairError ?? props.state.errorMessage}</small>}
          </div>
          <Button variant="primary" disabled={repairing || props.state.phase === "connecting"} onClick={runPrimaryAction}>
            {repairing && <Spinner />}
            {props.state.phase === "not-installed" ? t("Install") : props.state.phase === "not-running" ? t("Start") : props.state.phase === "version-mismatch" ? t("Upgrade") : props.state.phase === "owned-by-other-user" ? t("Take Over") : t("Retry")}
          </Button>
        </div>
      </div>
    </section>
  );

  let content;
  if (page === "overview") content = renderHome();
  else if (page === "account") content = <AeroAccountView host={props.host} account={props.account} onAccountUpdated={props.onAccountUpdated} />;
  else if (page === "faq") content = <AeroFaqView />;
  else if (page === "tools") content = <AeroMoreView />;
  else if (page === "settings") content = <AeroSettingsView host={props.host} onLogout={props.onLogout} />;
  else if (page === "profiles") {
    content = <section className={pageStyles.page}><header className={pageStyles.pageHeader}><h1>{t("Profiles")}</h1></header><div className={styles.profileBody}><ProfileCard host={props.host} /></div></section>;
  } else {
    content = (
      <section className={pageStyles.page}>
        <header className={pageStyles.pageHeader}><h1>{t("AeroVPN")}</h1></header>
        <div className={styles.profileBody}>
          <div className={styles.setupNotice}><span className={styles.setupNoticeIcon}><AeroIcon name="cloud_outlined" size={21} /></span><div className={styles.setupNoticeText}><strong>{title}</strong><span>{t("Start the AeroVPN service to use this page.")}</span></div><Button variant="primary" onClick={runPrimaryAction}>{props.state.phase === "not-installed" ? t("Install") : t("Retry")}</Button></div>
        </div>
      </section>
    );
  }

  return (
    <div className={styles.shell}>
      <AeroSidebar
        windowTitlebarInset
        activePage={activePage}
        onNavigate={(destination) => navigate(destination)}
        onInvite={() => setInviteOpen(true)}
        accountTitle={props.account.email}
        membershipLabel={props.account.plan?.name || t("Not subscribed")}
      />
      <main className={styles.main}>{content}</main>
      {inviteOpen && <Dialog onClose={() => setInviteOpen(false)}><h2>{t("Invite & Earn")}</h2><div className="dialog-message"><p>{t("Referral features are not available from the current account API.")}</p></div><div className="row-actions dialog-actions"><Button onClick={() => setInviteOpen(false)}>{t("Ok")}</Button></div></Dialog>}
      {confirmingTakeOver && <Dialog onClose={() => (repairing ? undefined : setConfirmingTakeOver(false))}><h2>{t("Take Over AeroVPN?")}</h2><div className="dialog-message"><p>{t("The other user's AeroVPN service will stop.")}</p></div><div className="row-actions dialog-actions"><Button onClick={() => setConfirmingTakeOver(false)} disabled={repairing}>{t("Cancel")}</Button><Button variant="danger" disabled={repairing} onClick={() => runRepair(props.host.service.takeOver, () => setConfirmingTakeOver(false))}>{repairing && <Spinner />}{t("Stop and Take Over")}</Button></div></Dialog>}
    </div>
  );
}
