import "@fontsource-variable/schibsted-grotesk/index.css";
import "@fontsource-variable/source-serif-4/index.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";

import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import type { DaemonApi } from "./api/daemon";
import type { StreamSnapshot, StreamStore } from "./api/stream";
import { ApiContext } from "./app/context";
import type { AeroAccountSnapshot, DesktopHost } from "./app/desktop";
import { I18nProvider } from "./app/i18n";
import { ServiceStatus_Type } from "./gen/daemon/started_service_pb";
import "./styles/globals.css";
import "./styles/shared.css";
import { AeroHomeView } from "./views/AeroHomeView";
import { AeroAccountView } from "./views/AeroAccountView";
import { AeroMoreView } from "./views/AeroMoreView";
import { AeroSettingsView } from "./views/AeroSettingsView";
import { AeroDesktopSetupView } from "./views/AeroDesktopSetupView";
import { AeroFaqView } from "./views/AeroFaqView";
import { ProfileCard } from "./views/ProfileViews";
import { AeroSidebar } from "./views/AeroSidebar";
import "./codex-aero-preview.css";

function fixedStream<T>(data: T): StreamStore<T> {
  const snapshot: StreamSnapshot<T> = { phase: "active", data };
  return {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
  } as unknown as StreamStore<T>;
}

const demoApi = {
  serviceStatus: fixedStream({ status: { status: ServiceStatus_Type.STARTED } }),
} as unknown as DaemonApi;

const demoAccount = { email: "demo@example.com", plan: null } satisfies AeroAccountSnapshot;

const demoHost = {
  platform: "win32",
  managedMode: true,
  appVersion: async () => "1.0.0",
  profiles: {
    list: async () => ({
      selectedId: null,
      profiles: [],
    }),
    onChanged: () => () => {},
  },
  systemProxy: {
    status: async () => ({ available: true, enabled: false }),
    setEnabled: async () => {},
  },
  auth: {
    refreshAccount: async () => demoAccount,
    getRegions: async () => [{
      id: "us", name: "United States", code: "US", flagEmoji: "🇺🇸", recommended: true,
      cities: [{ id: "nyc", name: "New York", latencyMs: 35, loadPercent: 20, features: [] }],
    }],
    activeConnection: async () => null,
    connect: async () => { throw new Error("Preview mode does not establish a VPN connection."); },
    disconnect: async () => {},
    listConnectSessions: async () => [],
    revokeConnectSession: async () => {},
    restore: async () => demoAccount,
    sendVerificationCode: async () => {},
    register: async () => {},
    login: async () => demoAccount,
    forgotPassword: async () => {},
    resetPassword: async () => {},
    logout: async () => {},
  },
  service: { start: async () => {}, stop: async () => {} },
  settings: {
    get: async () => ({ speedMode: "disabled", openAtLogin: false, trayEnabled: true, trayInBackground: false, oomKillerEnabled: false, oomMemoryLimitMB: 0, oomKillerKillConnections: false, powerReportEnabled: false }),
    setOpenAtLogin: async () => {},
  },
  setup: { repairInstall: async () => true, repairStart: async () => true },
  daemon: { retryConnection: () => {}, onStateChanged: () => () => {}, getState: async () => ({ phase: "not-installed" }) },
} as unknown as DesktopHost;

function Preview() {
  const readPage = (): "home" | "account" | "more" | "settings" | "faq" | "profiles" => {
    const route = window.location.hash.replace(/^#\/?/, "").split("/")[0];
    if (route === "account") return "account";
    if (route === "faq") return "faq";
    if (route === "profiles") return "profiles";
    if (route === "tools") return "more";
    if (route === "settings") return "settings";
    return "home";
  };
  const [page, setPage] = useState<"home" | "account" | "more" | "settings" | "faq" | "profiles">(readPage);

  useEffect(() => {
    const onHashChange = () => setPage(readPage());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (new URLSearchParams(window.location.search).has("setup")) {
    return (
      <div className="preview-desktop">
        <div className="preview-titlebar" />
        <AeroDesktopSetupView
          host={demoHost}
          state={{ phase: "not-installed" }}
          page={page === "home" ? "overview" : page === "more" ? "tools" : page}
          account={demoAccount}
          onLogout={async () => {}}
        />
      </div>
    );
  }

  return (
    <div className="preview-shell">
      <AeroSidebar
        activePage={page === "account" ? "store" : page === "faq" || page === "profiles" ? "home" : page}
        onNavigate={(destination) => {
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
          setPage(destination === "overview" ? "home" : destination === "account" ? "account" : destination === "tools" ? "more" : "settings");
        }}
        onInvite={() => setPage("account")}
        accountTitle={demoAccount.email}
        membershipLabel="未开通会员"
      />
      <main className="preview-main">
        {page === "home" && <AeroHomeView host={demoHost} account={demoAccount} />}
        {page === "account" && <AeroAccountView host={demoHost} account={demoAccount} />}
        {page === "more" && <AeroMoreView />}
        {page === "settings" && <AeroSettingsView host={demoHost} onLogout={async () => {}} />}
        {page === "faq" && <AeroFaqView />}
        {page === "profiles" && <section className="page"><header className="page-header"><h1>配置</h1></header><ProfileCard host={demoHost} /></section>}
      </main>
    </div>
  );
}

document.documentElement.dataset.aeroApp = "true";
document.documentElement.dataset.theme = "light";
document.documentElement.dataset.accent = "default";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <ApiContext.Provider value={demoApi}>
        <Preview />
      </ApiContext.Provider>
    </I18nProvider>
  </StrictMode>,
);
