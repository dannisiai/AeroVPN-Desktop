import { useState } from "react";

import { useI18n } from "../app/i18n";
import { Icon } from "../components/Icon";
import styles from "./AeroPages.module.css";

const faqItems = [
  { question: "节点全红怎么办？", answer: "请将网络环境切换为移动蜂窝数据，执行断开并重连操作。部分运营商可能会存在瞬时阻断，如重连失败，请于 5–15 分钟后重试。" },
  { question: "安卓点击按钮没反应？", answer: "为了保证正常启动，请先开启软件的通知权限。另外，请确认手机设置里的 VPN 设置中没有其他 VPN 开启“始终连接”；如有请关闭，并退出校园网 VPN 软件，避免连接冲突。" },
  { question: "电脑端连接报错？", bullets: ["彻底退出杀毒软件和可能占用端口的其他工具，重启电脑后再重新连接。如果看到 IPv6 相关报错，通常是网卡配置未开启。", "若有软件开机自启，请先手动退出再启动本客户端。", "部分电脑系统不支持虚拟网卡模式，可以尝试在设置里改成普通模式。"] },
  { question: "电脑端初始化失败？", bullets: ["尝试切换网络环境（如从 Wi-Fi 切换到手机热点），排除本地网络阻断。", "若更新后出现此问题，请彻底卸载当前版本后前往官网下载最新版。", "若 PC 端提示初始化失败，请查看官网下载的客户端文档。", "如果以上方法无效，请联系在线客服。"] },
  { question: "电脑端启动出现 xxx.dll 错误？", answer: "若启动时提示缺少 .dll 文件，说明系统可能缺少微软 VC++ 运行库。安装运行库并重启软件后再试。" },
  { question: "Mac 系统出现软件闪退？", answer: "首次打开时请在“隐私与安全性”中授予信任。软件启动后图标位于屏幕顶部导航栏。如遇闪退，请尝试重启电脑或重新安装客户端。" },
  { question: "关于电脑端虚拟网卡模式", answer: "默认模式仅代理系统代理设置覆盖的流量。若要让其他桌面软件也通过代理连接，请在 AeroVPN 配置中启用 TUN 入站。部分校园网环境可能存在限制，请视实际网络情况测试。" },
  { question: "关于路由模式介绍", bullets: ["自动模式：按照配置文件的路由规则决定流量走向。", "全局模式：所有网络请求均通过代理服务器。"] },
];

export function AeroFaqView() {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([0]));

  const toggle = (index: number) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    return next;
  });

  return (
    <section className={styles.page}>
      <header className={styles.pageHeader}><h1>{t("FAQ")}</h1></header>
      <div className={styles.faqBody}>
        {faqItems.map((item, index) => {
          const isExpanded = expanded.has(index);
          return (
            <section className={styles.faqCard} key={item.question}>
              <button type="button" className={styles.faqQuestion} aria-expanded={isExpanded} onClick={() => toggle(index)}>
                <strong>{item.question}</strong>
                <Icon name={isExpanded ? "expand_less" : "expand_more"} size={24} />
              </button>
              {isExpanded && (
                <div className={styles.faqAnswer}>
                  {item.answer && <p>{item.answer}</p>}
                  {item.bullets?.map((bullet) => <p className={styles.faqBullet} key={bullet}><span>•</span>{bullet}</p>)}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
