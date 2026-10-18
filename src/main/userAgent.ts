import { preferredLocale } from "./locale";

const applicationName = "AeroVPN";

export function userAgent(): string {
  return `${applicationName} (${__APP_VERSION__}; language ${preferredLocale().replaceAll("-", "_")})`;
}
