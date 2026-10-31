param(
    [Parameter(Mandatory = $true)]
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

[System.IO.File]::WriteAllText(
    $OutputPath,
    [Guid]::NewGuid().ToString('D'),
    [System.Text.Encoding]::ASCII
)
