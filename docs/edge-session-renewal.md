# Managed Hysteria credentials

The account API is served at `https://hy2.ethworldcupcoin.xyz`, alongside the
account portal. TLS verification stays enabled. The node token is supplied by
the API rather than embedded in the application.

When `/v1/connect` returns `credential_refresh_required: true`, the main process
requests a replacement connection up to two minutes before its expiry. It
reloads the managed daemon with that profile and retains the selected TUN or
system proxy settings. Short-lived node credentials are not added to the
encrypted account session file.

Temporary network errors and HTTP 429 are retried every 15 seconds, bounded by
the existing credential's expiry. An expired, revoked or otherwise rejected
connection is stopped locally and its Windows system proxy is restored. Normal
account-token refresh continues to rotate the access and refresh tokens; a
rate-limited refresh no longer deletes the saved login.

Account operations and renewals are serialized so disconnecting or signing out
cannot be followed by an earlier renewal restarting the service. On application
restore the expiry timer is armed even if loading the account fails. Older
saved sessions without connection settings remain usable until their original
connection expires, at which point a new connection must be selected.

The Windows GitHub workflow packages this Electron application and its pinned
Dashboard and connection engine. No automated or connection tests were run for
this change, as requested by the operator.
