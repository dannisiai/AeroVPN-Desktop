import { Icon, type IconName } from "./Icon";

export type AeroIconName =
  | "home_outlined"
  | "shopping_bag_outlined"
  | "card_giftcard_outlined"
  | "help_outline_rounded"
  | "cloud_outlined"
  | "access_time_rounded"
  | "sync_rounded"
  | "more_horiz"
  | "settings"
  | "keyboard_arrow_right"
  | "power_settings_new"
  | "sync"
  | "download"
  | "upload"
  | "swap_vert"
  | "person"
  | "handshake"
  | "public"
  | "receipt"
  | "support_agent"
  | "campaign"
  | "confirmation_number"
  | "language"
  | "route"
  | "tune"
  | "shield"
  | "system_update"
  | "description"
  | "security"
  | "info"
  | "lock"
  | "logout";

const CUSTOM_PATHS: Partial<Record<AeroIconName, string>> = {
  home_outlined: "M3 10.5 12 3l9 7.5M5.5 9v10h5v-6h3v6h5V9",
  shopping_bag_outlined: "M6 8h12l1 13H5L6 8Zm3 0V6a3 3 0 0 1 6 0v2",
  card_giftcard_outlined: "M4 9h16v12H4zM3 5h18v4H3zM12 5v16m0-16H8.8a2.3 2.3 0 1 1 2.1-3.2L12 5Zm0 0h3.2a2.3 2.3 0 1 0-2.1-3.2L12 5Z",
  help_outline_rounded: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.7 9a2.3 2.3 0 1 1 4.2 1.3c-.6.7-1.9 1.1-1.9 2.7M12 17h.01",
  cloud_outlined: "M19 18H6a4 4 0 0 1-.4-8 6 6 0 0 1 11.6-1.1A4.5 4.5 0 0 1 19 18Z",
  access_time_rounded: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 6v6l4 2",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z",
  handshake: "M8 7 4 11l4 4 3-3 2 2 5-5-4-3-3 2-3-1Zm-4 4-2 2 4 4 2-2m9-7 3 2-4 4-2-2m-9 1 3 3 2-2 2 2 2-2",
  public: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM4 12h16M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20",
  receipt: "M6 3 8 4l2-1 2 1 2-1 2 1 2-1v18l-2-1-2 1-2-1-2 1-2-1-2 1V3Zm3 5h6m-6 4h6m-6 4h4",
  support_agent: "M4 13v-2a8 8 0 0 1 16 0v2m-16 0v3h4v-5H4m16 2v3h-4v-5h4m-8 8h3",
  campaign: "M3 11v2h3l11 5V6L6 11H3Zm3 2 2 6h4l-2-5m7-7 3-2m-3 10 3 2",
  confirmation_number: "M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V6Zm10 0v2m0 2v2m0 2v2",
  language: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM4 12h16M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20",
  route: "M6 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm12 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM8 6h5a3 3 0 0 1 3 3v6a3 3 0 0 0 3 3M6 8v8a3 3 0 0 0 3 3h7",
  shield: "M12 3 20 6v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6l8-3Zm-3 9 2 2 4-4",
  system_update: "M12 3v11m-4-4 4 4 4-4M5 17v3h14v-3",
  description: "M6 3h9l4 4v14H6V3Zm8 1v5h5m-9 4h6m-6 4h6",
  security: "M12 3 20 6v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6l8-3Zm-3 9 2 2 4-4",
  info: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 9v5m0-9h.01",
  lock: "M5 10h14v11H5V10Zm3 0V7a4 4 0 1 1 8 0v3m-4 4v3",
  logout: "M10 17l5-5-5-5m5 5H3m9-9h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7",
};

const EXISTING_ICONS: Partial<Record<AeroIconName, IconName>> = {
  more_horiz: "more_horiz",
  settings: "settings",
  keyboard_arrow_right: "keyboard_arrow_right",
  power_settings_new: "power_settings_new",
  sync: "sync",
  sync_rounded: "sync",
  download: "download",
  upload: "upload",
  swap_vert: "swap_vert",
  tune: "tune",
};

export function AeroIcon(props: { name: AeroIconName; size?: number }) {
  const size = props.size ?? 24;
  const existing = EXISTING_ICONS[props.name];
  if (existing !== undefined) {
    return <Icon name={existing} size={size} />;
  }

  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={props.name === "home_outlined" || props.name === "shopping_bag_outlined" || props.name === "cloud_outlined" ? 1.7 : 1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={CUSTOM_PATHS[props.name]} />
    </svg>
  );
}
