$ErrorActionPreference = "Stop"

$service = Get-Service -Name "sing-box-daemon" -ErrorAction SilentlyContinue
if ($null -eq $service) {
    exit 0
}

$service.Refresh()
if ($service.Status -eq [System.ServiceProcess.ServiceControllerStatus]::Stopped) {
    exit 0
}

if ($service.Status -ne [System.ServiceProcess.ServiceControllerStatus]::StopPending) {
    Stop-Service -InputObject $service -Force -ErrorAction Stop
}

$service.WaitForStatus(
    [System.ServiceProcess.ServiceControllerStatus]::Stopped,
    [TimeSpan]::FromSeconds(30)
)
