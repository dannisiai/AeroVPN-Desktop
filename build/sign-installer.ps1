param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($env:AEROVPN_SIGNING_CERTIFICATE) -or
    [string]::IsNullOrWhiteSpace($env:AEROVPN_SIGNING_PASSWORD)) {
    throw 'AeroVPN installer signing configuration is unavailable.'
}

$signTool = Get-Command signtool.exe -ErrorAction Stop
& $signTool.Source sign `
    /f $env:AEROVPN_SIGNING_CERTIFICATE `
    /p $env:AEROVPN_SIGNING_PASSWORD `
    /fd SHA256 `
    $FilePath
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
