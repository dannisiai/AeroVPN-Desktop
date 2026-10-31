import { useEffect, useState } from "react";

import { navigate, useApi } from "../app/context";
import { loadAeroConnectionPreferences } from "../app/connectionMode";
import { displayedLatencyMs, useUsNodeLatency } from "../app/displayedLatency";
import type { AeroAccountSnapshot, AeroConnectionSnapshot, AeroRegionSnapshot, DesktopHost } from "../app/desktop";
import { useI18n } from "../app/i18n";
import { nodeNumberForCity } from "../app/regionNodes";
import aeroLogo from "../assets/aero-logo.png";
import { Icon } from "../components/Icon";
import { AeroIcon } from "../components/AeroIcon";
import { Dialog } from "../components/ui";
import { ServiceStatus_Type } from "../gen/daemon/started_service_pb";
import { useStream } from "../api/stream";
import styles from "./AeroHomeView.module.css";

const SELECTED_REGION_KEY = "aerovpn.selected-region";
const SELECTED_CITY_KEY = "aerovpn.selected-city";
const ACCOUNT_REFRESH_INTERVAL_MS = 60_000;

export function AeroHomeView(props: {
  host: DesktopHost;
  account: AeroAccountSnapshot;
  onAccountUpdated?: (account: AeroAccountSnapshot) => void;
}) {
  const api = useApi();
  const { t } = useI18n();
  const usNodeLatency = useUsNodeLatency();
  const serviceStatus = useStream(api.serviceStatus);
  const [regions, setRegions] = useState<AeroRegionSnapshot[]>([]);
  const [connection, setConnection] = useState<AeroConnectionSnapshot | null>(null);
  const [regionId, setRegionId] = useState(() => window.localStorage.getItem(SELECTED_REGION_KEY));
  const [cityId, setCityId] = useState(() => window.localStorage.getItem(SELECTED_CITY_KEY));
  const [regionPickerOpen, setRegionPickerOpen] = useState(false);
  const [expandedRegionIds, setExpandedRegionIds] = useState<Set<string>>(() =>
    regionId === null ? new Set() : new Set([regionId]),
  );
  const [regionsLoading, setRegionsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    void Promise.all([props.host.auth.getRegions(), props.host.auth.activeConnection()])
      .then(([nextRegions, activeConnection]) => {
        if (disposed) return;
        setRegions(nextRegions);
        setConnection(activeConnection);
        if (activeConnection !== null) {
          setRegionId(activeConnection.regionId);
          setCityId(activeConnection.cityId);
        } else {
          const storedRegion = window.localStorage.getItem(SELECTED_REGION_KEY);
          const storedCity = window.localStorage.getItem(SELECTED_CITY_KEY);
          const initialRegion = nextRegions.find((region) => region.id === storedRegion)
            ?? nextRegions.find((region) => region.recommended)
            ?? nextRegions[0];
          const initialCity = initialRegion?.cities.find((city) => city.id === storedCity)
            ?? initialRegion?.cities[0];
          setRegionId(initialRegion?.id ?? null);
          setCityId(initialCity?.id ?? null);
        }
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setErrorMessage(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!disposed) setRegionsLoading(false);
      });
    return () => { disposed = true; };
  }, [props.host]);

  useEffect(() => {
    let disposed = false;
    let refreshing = false;
    const refreshAccount = async () => {
      if (disposed || refreshing) return;
      refreshing = true;
      try {
        const account = await props.host.auth.refreshAccount();
        if (!disposed) props.onAccountUpdated?.(account);
      } catch {
        // Keep the last known account snapshot if a periodic refresh fails.
      } finally {
        refreshing = false;
      }
    };
    void refreshAccount();
    const timer = window.setInterval(() => void refreshAccount(), ACCOUNT_REFRESH_INTERVAL_MS);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [props.host, props.onAccountUpdated]);

  const selectedRegion = regions.find((region) => region.id === regionId) ?? null;
  const selectedCity = selectedRegion?.cities.find((city) => city.id === cityId) ?? selectedRegion?.cities[0] ?? null;
  const serviceType = serviceStatus.data.status?.status;
  const serviceStarted = serviceType === ServiceStatus_Type.STARTED;
  const disconnecting = serviceType === ServiceStatus_Type.STOPPING;
  const connecting = serviceType === ServiceStatus_Type.STARTING || busy;
  const connected = serviceStarted && connection !== null;
  const canDisconnect = serviceStarted;

  useEffect(() => {
    let disposed = false;
    void props.host.auth.activeConnection().then((activeConnection) => {
      if (!disposed) setConnection(activeConnection);
    }).catch(() => {});
    return () => { disposed = true; };
  }, [props.host, serviceStarted]);
  const plan = props.account.plan;
  const planActive = plan?.status === "active" && plan.expiresAt > Math.floor(Date.now() / 1000);
  const remainingDays = planActive && plan !== null
    ? Math.max(0, Math.floor((plan.expiresAt * 1000 - Date.now()) / 86_400_000))
    : 0;
  const trafficRemaining = plan === null || !planActive || plan.trafficGb === null
    ? "—"
    : plan.trafficGb <= 0
      ? t("Unlimited")
      : plan.trafficUsedGb === null
        ? "—"
        : `${Math.max(0, plan.trafficGb - plan.trafficUsedGb).toFixed(0)} GB`;

  const selectedNodeNumber = nodeNumberForCity(regions, selectedRegion?.id ?? null, selectedCity?.id ?? null);
  const displayCity = selectedCity !== null
    ? t("Node {number}", { number: selectedNodeNumber ?? 1 })
    : connection !== null
      ? t("Node {number}", { number: 1 })
      : t("Choose a region");
  const displayCountry = connection?.countryName ?? selectedRegion?.name ?? t("Server list unavailable");
  const displayFlag = selectedRegion?.flagEmoji ?? "🌐";
  const latency = selectedRegion !== null && selectedCity !== null
    ? displayedLatencyMs(selectedRegion, selectedCity, usNodeLatency)
    : null;
  const openRegionPicker = () => {
    setExpandedRegionIds(regionId === null ? new Set() : new Set([regionId]));
    setRegionPickerOpen(true);
  };

  const selectCity = (region: AeroRegionSnapshot, cityIdValue: string) => {
    setRegionId(region.id);
    setCityId(cityIdValue);
    window.localStorage.setItem(SELECTED_REGION_KEY, region.id);
    window.localStorage.setItem(SELECTED_CITY_KEY, cityIdValue);
    setRegionPickerOpen(false);
    setErrorMessage(null);
  };

  const toggleConnection = async () => {
    if (connecting || disconnecting) return;
    setErrorMessage(null);
    setBusy(true);
    try {
      if (canDisconnect) {
        await props.host.auth.disconnect();
        setConnection(null);
      } else {
        if (selectedRegion === null || selectedCity === null) {
          throw new Error(t("Choose a region before connecting."));
        }
        const connectionPreferences = loadAeroConnectionPreferences();
        const nextConnection = await props.host.auth.connect(
          selectedRegion.id,
          selectedCity.id,
          connectionPreferences.mode,
          {
            localPort: connectionPreferences.localPort,
            routingMode: connectionPreferences.routingMode === "global" ? "global" : "auto",
            secureDns: connectionPreferences.secureDns,
          },
        );
        setConnection(nextConnection);
        setRegionId(nextConnection.regionId);
        setCityId(nextConnection.cityId);
        window.localStorage.setItem(SELECTED_REGION_KEY, nextConnection.regionId);
        window.localStorage.setItem(SELECTED_CITY_KEY, nextConnection.cityId);
        api.serviceStatus.retryNow();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const actionText = disconnecting
    ? t("DISCONNECTING...")
    : connecting
      ? t("Establishing Tunnel...")
      : canDisconnect
        ? t("Click to Disconnect")
        : t("Click to Connect");
  const buttonDisabled = disconnecting || connecting || regionsLoading || selectedCity === null;

  return (
    <section className={styles.page}>
      <div className={styles.topBar}>
        <button
          type="button"
          className={styles.faqButton}
          aria-label={t("FAQ")}
          title={t("FAQ")}
          onClick={() => navigate("faq")}
        >
          <AeroIcon name="help_outline_rounded" size={24} />
        </button>
      </div>

      <div className={styles.centerArea}>
        <div className={styles.connectControl}>
          <button
            type="button"
            className={`${styles.connectButton} ${connected ? styles.connected : ""} ${connecting ? styles.connecting : ""}`}
            onClick={() => void toggleConnection()}
            disabled={buttonDisabled}
            aria-label={connected ? t("Disconnect") : t("Connect")}
            aria-pressed={connected}
          >
            {connecting ? (
              <span className={styles.spinner} />
            ) : (
              <img className={styles.connectLogo} src={aeroLogo} alt="AeroVPN" />
            )}
          </button>
          <span className={`${styles.connectLabel} ${connected ? styles.connectLabelOn : ""}`}>
            {actionText}
          </span>
        </div>
      </div>

      <div className={styles.bottomSection}>
        <button
          type="button"
          className={styles.serverCard}
          onClick={openRegionPicker}
          aria-label={t("Change server")}
          disabled={regionsLoading || regions.length === 0}
        >
          <span className={styles.flagAvatar} aria-hidden="true">{displayFlag}</span>
          <span className={styles.locationDetails}>
            <span className={styles.locationTitle}>
              <strong>{displayCity}</strong>
              <span>{displayCountry}</span>
            </span>
            <span className={styles.latency}>
              <span className={`${styles.latencyDot} ${latency === null || latency <= 0 ? styles.latencyDotUnavailable : latency >= 100 ? styles.latencyDotWarning : ""}`} />
              {latency === null ? "—" : `${latency} ms`}
            </span>
          </span>
        </button>

        <section className={styles.planCard} aria-label={t("Plan status")}>
          <div className={styles.planColumn}>
            <span className={`${styles.planIcon} ${styles.planIconCloud}`}>
              <AeroIcon name="cloud_outlined" size={24} />
            </span>
            <strong>{planActive ? plan?.name || t("Active subscription") : t("Not subscribed")}</strong>
            <span className={styles.planCaption}>{t("Plan Tier")}</span>
          </div>
          <span className={styles.divider} />
          <div className={styles.planColumn}>
            <span className={`${styles.planIcon} ${styles.planIconTime}`}>
              <AeroIcon name="access_time_rounded" size={24} />
            </span>
            <strong>{remainingDays} {t("days")}</strong>
            <span className={styles.planCaption}>{planActive ? t("Days remaining") : t("Plan expired")}</span>
          </div>
          <span className={styles.divider} />
          <div className={styles.planColumn}>
            <span className={`${styles.planIcon} ${styles.planIconTraffic}`}>
              <AeroIcon name="sync_rounded" size={24} />
            </span>
            <strong>{trafficRemaining}</strong>
            <span className={styles.planCaption}>{t("Remaining Data")}</span>
          </div>
        </section>

        {errorMessage !== null && (
          <div className={styles.errorMessage} role="status">
            <span className={styles.errorSymbol}>!</span>
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {regionPickerOpen && (
        <Dialog onClose={() => setRegionPickerOpen(false)} className={styles.regionPickerDialog}>
          <h2 className={styles.visuallyHidden}>{t("Select server location")}</h2>
          <header className={styles.regionPickerHeader}>
            <button
              type="button"
              className={styles.regionPickerClose}
              aria-label={t("Close")}
              title={t("Close")}
              onClick={() => setRegionPickerOpen(false)}
            >
              <Icon name="close" size={20} />
            </button>
          </header>
          <div className={styles.regionList}>
            {regions.map((region) => {
              const expanded = expandedRegionIds.has(region.id);
              return (
                <section className={styles.regionGroup} key={region.id}>
                  <button
                    type="button"
                    className={styles.regionHeader}
                    aria-expanded={expanded}
                    onClick={() => setExpandedRegionIds((current) => {
                      const next = new Set(current);
                      if (next.has(region.id)) next.delete(region.id);
                      else next.add(region.id);
                      return next;
                    })}
                  >
                    <span className={styles.regionFlag} aria-hidden="true">{region.flagEmoji}</span>
                    <span className={styles.regionHeadingCopy}>
                      <span className={styles.regionHeadingTitle}>
                        <strong>{region.name}</strong>
                      </span>
                      <small>{t("{count} locations", { count: region.cities.length })}</small>
                    </span>
                    <Icon name={expanded ? "expand_less" : "expand_more"} size={22} />
                  </button>
                  {expanded && (
                    <div className={styles.cityList}>
                      {region.cities.map((city) => {
                        const selected = region.id === regionId && city.id === cityId;
                        const displayLatency = displayedLatencyMs(region, city, usNodeLatency);
                        const latencyTone = displayLatency <= 0
                          ? styles.cityLatencyUnavailable
                          : displayLatency < 100
                            ? styles.cityLatencyFast
                            : styles.cityLatencySlower;
                        return (
                          <button
                            type="button"
                            key={city.id}
                            className={`${styles.cityOption} ${selected ? styles.cityOptionSelected : ""}`}
                            aria-pressed={selected}
                            onClick={() => selectCity(region, city.id)}
                          >
                            <span className={styles.cityFlag} aria-hidden="true">{region.flagEmoji}</span>
                            <span className={styles.cityName}>
                              {t("Node {number}", { number: nodeNumberForCity(regions, region.id, city.id) ?? 1 })}
                            </span>
                            <span className={`${styles.cityLatency} ${latencyTone}`}>
                              <i aria-hidden="true" />
                              {displayLatency > 0 ? `${displayLatency} ms` : "—"}
                            </span>
                            {selected
                              ? <span className={styles.citySelectedCheck}><Icon name="check" size={12} /></span>
                              : <span className={styles.cityCheckPlaceholder} aria-hidden="true" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </Dialog>
      )}
    </section>
  );
}
