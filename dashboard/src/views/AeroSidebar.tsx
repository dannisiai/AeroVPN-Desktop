import type { ReactNode } from "react";

import aeroAvatar from "../assets/aero-avatar.png";
import aeroLogo from "../assets/aero-logo.png";
import { AeroIcon, type AeroIconName } from "../components/AeroIcon";
import { useI18n } from "../app/i18n";
import styles from "./AeroSidebar.module.css";

export type AeroSidebarPage = "home" | "store" | "more" | "settings";
export type AeroSidebarDestination = "overview" | "account" | "tools" | "settings";

export function AeroSidebar(props: {
  className?: string;
  windowTitlebarInset?: boolean;
  activePage: AeroSidebarPage;
  onNavigate: (destination: AeroSidebarDestination) => void;
  onInvite: () => void;
  accountTitle?: string;
  membershipLabel?: string;
}) {
  const { t } = useI18n();

  const item = (
    id: string,
    label: string,
    icon: AeroIconName,
    destination: AeroSidebarDestination | null,
    active: boolean,
    onClick?: () => void,
  ): ReactNode => (
    <button
      key={id}
      type="button"
      className={`${styles.navItem} ${active ? styles.active : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={() => {
        if (destination !== null) props.onNavigate(destination);
        else onClick?.();
      }}
    >
      <AeroIcon name={icon} size={22} />
      <span>{label}</span>
    </button>
  );

  return (
    <nav
      className={`${styles.sidebar} ${props.windowTitlebarInset ? styles.windowTitlebar : ""} ${props.className ?? ""}`}
      aria-label="AeroVPN"
    >
      <div className={styles.brand}>
        <span className={styles.brandIcon}>
          <img src={aeroLogo} alt="" />
        </span>
        <span className={styles.brandName}>AeroVPN</span>
      </div>

      <div className={styles.accountCard}>
        <img className={styles.avatar} src={aeroAvatar} alt="" />
        <div className={styles.accountCopy}>
          <span className={styles.accountTitle}>{props.accountTitle ?? t("AeroVPN User")}</span>
          <span className={styles.membership}>{props.membershipLabel ?? t("Not subscribed")}</span>
        </div>
      </div>

      {item("home", t("Home"), "home_outlined", "overview", props.activePage === "home")}
      {item("store", t("Store"), "shopping_bag_outlined", "account", props.activePage === "store")}
      {item("invite", t("Invite & Earn"), "card_giftcard_outlined", null, false, props.onInvite)}
      {item("more", t("More"), "more_horiz", "tools", props.activePage === "more")}
      {item("settings", t("Settings"), "settings", "settings", props.activePage === "settings")}

      <div className={styles.footer}>v1.0.0</div>
    </nav>
  );
}
