import { useState } from "react";

import { useI18n } from "../app/i18n";
import { AeroIcon, type AeroIconName } from "../components/AeroIcon";
import { Button, Dialog } from "../components/ui";
import styles from "./AeroPages.module.css";

type MoreAction = "agent" | "website" | "orders" | "support" | "channel" | "tickets";

const actionDetails: Record<MoreAction, { title: string; icon: AeroIconName; color: string; body: string }> = {
  agent: { title: "申请代理合作", icon: "handshake", color: "#16a34a", body: "欢迎加入 AeroVPN 商业分销伙伴网络。商务合作：Telegram @AeroVPN_Partner · partner@aerovpn.com" },
  website: { title: "官方网站", icon: "public", color: "#ea580c", body: "AeroVPN 官方主站：https://aerovpn.com" },
  orders: { title: "我的订单记录", icon: "receipt", color: "#57534e", body: "当前账户 API 尚未提供订单查询接口。" },
  support: { title: "在线客服", icon: "support_agent", color: "#ef4444", body: "当前客户端尚未接入在线客服服务。" },
  channel: { title: "官方频道", icon: "campaign", color: "#7c3aed", body: "AeroVPN 官方 Telegram 频道：https://t.me/AeroVPN_Official" },
  tickets: { title: "工单列表", icon: "confirmation_number", color: "#9333ea", body: "当前账户 API 尚未提供工单查询接口。" },
};

export function AeroMoreView() {
  const { t } = useI18n();
  const [dialog, setDialog] = useState<MoreAction | null>(null);
  const details = dialog === null ? null : actionDetails[dialog];

  const row = (id: MoreAction, title: string, icon: AeroIconName) => (
    <button type="button" key={id} className={styles.moreRow} onClick={() => setDialog(id)}>
      <span className={styles.rowIcon}><AeroIcon name={icon} size={23} /></span>
      <strong>{title}</strong>
      <AeroIcon name="keyboard_arrow_right" size={22} />
    </button>
  );

  return (
    <section className={styles.page}>
      <header className={styles.pageHeader}><h1>{t("More")}</h1></header>
      <div className={styles.listBody}>
        <div className={styles.listCard}>
          {row("agent", t("Become Agent"), "handshake")}
          <div className={styles.rowDivider} />
          {row("website", t("Official Website"), "public")}
        </div>

        <h2 className={styles.listSectionTitle}>{t("Finance")}</h2>
        <div className={styles.listCard}>{row("orders", t("My Orders"), "receipt")}</div>

        <h2 className={styles.listSectionTitle}>{t("Customer Support")}</h2>
        <div className={styles.listCard}>
          {row("support", t("Live Support"), "support_agent")}
          <div className={styles.rowDivider} />
          {row("channel", t("Official Channel"), "campaign")}
          <div className={styles.rowDivider} />
          {row("tickets", t("Support Tickets"), "confirmation_number")}
        </div>

      </div>

      {details && (
        <Dialog onClose={() => setDialog(null)}>
          <h2 className={styles.dialogHeading}><span style={{ color: details.color }}><AeroIcon name={details.icon} size={22} /></span>{details.title}</h2>
          <div className="dialog-message"><p>{details.body}</p></div>
          <div className="row-actions dialog-actions"><Button variant="primary" onClick={() => setDialog(null)}>{t("Confirm")}</Button></div>
        </Dialog>
      )}
    </section>
  );
}
