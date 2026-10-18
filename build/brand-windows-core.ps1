$ErrorActionPreference = 'Stop'

$coreRoot = Join-Path $env:GITHUB_WORKSPACE 'sing-box'

function Replace-ExactText {
    param(
        [Parameter(Mandatory = $true)][string] $RelativePath,
        [Parameter(Mandatory = $true)][string] $OldText,
        [Parameter(Mandatory = $true)][string] $NewText
    )

    $filePath = Join-Path $coreRoot $RelativePath
    $source = [System.IO.File]::ReadAllText($filePath)
    $matches = [regex]::Matches($source, [regex]::Escape($OldText)).Count
    if ($matches -ne 1) {
        throw "Expected one branding target in $RelativePath, found $matches."
    }

    [System.IO.File]::WriteAllText(
        $filePath,
        $source.Replace($OldText, $NewText),
        [System.Text.UTF8Encoding]::new($false)
    )
}

Replace-ExactText 'experimental/boxdd/cmd_service_windows.go' 'serviceDisplayName             = "sing-box Service"' 'serviceDisplayName             = "AeroVPN Service"'
Replace-ExactText 'experimental/boxdd/cmd_service_windows.go' 'serviceDescriptionText         = "Privileged service for sing-box"' 'serviceDescriptionText         = "Privileged service for AeroVPN"'
Replace-ExactText 'experimental/boxdd/peer_windows.go' 'daemonExecutableName      = "sing-box-daemon.exe"' 'daemonExecutableName      = "aerovpn-service.exe"'
Replace-ExactText 'experimental/boxdd/peer_windows.go' 'applicationExecutableName = "sing-box.exe"' 'applicationExecutableName = "AeroVPN.exe"'
Replace-ExactText 'experimental/boxdd/peer_windows.go' 'named pipe client is not the installed sing-box worker' 'named pipe client is not the installed AeroVPN worker'
Replace-ExactText 'experimental/boxdd/peer_windows.go' 'authenticate sing-box worker' 'authenticate AeroVPN worker'
Replace-ExactText 'experimental/boxdd/peer_windows.go' 'sing-box worker and daemon have different signing certificates' 'AeroVPN worker and daemon have different signing certificates'
