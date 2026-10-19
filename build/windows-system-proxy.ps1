param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("enable", "restore")]
  [string]$Action,

  [int]$Port = 0,
  [string]$StateFile,
  [string]$BypassDomain = ""
)

$ErrorActionPreference = "Stop"
$settingsPath = "Software\Microsoft\Windows\CurrentVersion\Internet Settings"
$connectionsPath = "$settingsPath\Connections"

function Save-RegistryValues {
  param(
    [string]$Path,
    [string[]]$Names
  )

  $records = [System.Collections.Generic.List[object]]::new()
  $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($Path, $false)
  try {
    $existingNames = @()
    if ($null -ne $key) {
      $existingNames = $key.GetValueNames()
    }
    foreach ($name in $Names) {
      $record = [ordered]@{
        Name = $name
        Exists = $false
        Kind = $null
        Data = $null
      }
      if ($null -ne $key -and $existingNames -contains $name) {
        $kind = $key.GetValueKind($name)
        $data = $key.GetValue(
          $name,
          $null,
          [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames
        )
        if ($kind -eq [Microsoft.Win32.RegistryValueKind]::Binary) {
          $data = [Convert]::ToBase64String($data)
        }
        $record.Exists = $true
        $record.Kind = $kind.ToString()
        $record.Data = $data
      }
      $records.Add([pscustomobject]$record)
    }
  } finally {
    if ($null -ne $key) {
      $key.Dispose()
    }
  }
  return $records.ToArray()
}

function Restore-RegistryValues {
  param(
    [string]$Path,
    [object[]]$Records
  )

  $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($Path)
  if ($null -eq $key) {
    throw "Could not open the current user's Internet Settings registry key."
  }
  try {
    foreach ($record in $Records) {
      if (-not $record.Exists) {
        $key.DeleteValue([string]$record.Name, $false)
        continue
      }

      $kind = [Microsoft.Win32.RegistryValueKind]([string]$record.Kind)
      $data = switch ($kind) {
        Binary { [Convert]::FromBase64String([string]$record.Data) }
        DWord { [int]$record.Data }
        QWord { [long]$record.Data }
        MultiString { [string[]]@($record.Data) }
        default { [string]$record.Data }
      }
      $key.SetValue([string]$record.Name, $data, $kind)
    }
    $key.Flush()
  } finally {
    $key.Dispose()
  }
}

$winInetSource = @"
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class AeroVpnWinInetProxy {
    private const uint InternetOptionPerConnectionOption = 75;
    private const uint InternetOptionSettingsChanged = 39;
    private const uint InternetOptionRefresh = 37;
    private const uint InternetOptionProxySettingsChanged = 95;
    private const uint InternetPerConnectionFlags = 1;
    private const uint InternetPerConnectionProxyServer = 2;
    private const uint InternetPerConnectionProxyBypass = 3;

    [StructLayout(LayoutKind.Explicit)]
    private struct OptionValue {
        [FieldOffset(0)] public uint DwordValue;
        [FieldOffset(0)] public IntPtr StringValue;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PerConnectionOption {
        public uint Option;
        public OptionValue Value;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PerConnectionOptionList {
        public uint Size;
        public IntPtr Connection;
        public uint Count;
        public uint Error;
        public IntPtr Options;
    }

    [DllImport("wininet.dll", EntryPoint = "InternetSetOptionW", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool InternetSetOptionW(
        IntPtr internet,
        uint option,
        IntPtr buffer,
        uint bufferSize
    );

    public static void SetSystemProxy(string proxy, string bypass) {
        IntPtr proxyPointer = IntPtr.Zero;
        IntPtr bypassPointer = IntPtr.Zero;
        IntPtr optionsPointer = IntPtr.Zero;
        IntPtr listPointer = IntPtr.Zero;
        try {
            proxyPointer = Marshal.StringToHGlobalUni(proxy);
            bypassPointer = Marshal.StringToHGlobalUni(bypass);
            var options = new[] {
                new PerConnectionOption {
                    Option = InternetPerConnectionFlags,
                    Value = new OptionValue { DwordValue = 3 }
                },
                new PerConnectionOption {
                    Option = InternetPerConnectionProxyServer,
                    Value = new OptionValue { StringValue = proxyPointer }
                },
                new PerConnectionOption {
                    Option = InternetPerConnectionProxyBypass,
                    Value = new OptionValue { StringValue = bypassPointer }
                }
            };
            int optionSize = Marshal.SizeOf(typeof(PerConnectionOption));
            optionsPointer = Marshal.AllocHGlobal(optionSize * options.Length);
            for (int index = 0; index < options.Length; index++) {
                Marshal.StructureToPtr(
                    options[index],
                    IntPtr.Add(optionsPointer, index * optionSize),
                    false
                );
            }

            var list = new PerConnectionOptionList {
                Size = (uint)Marshal.SizeOf(typeof(PerConnectionOptionList)),
                Connection = IntPtr.Zero,
                Count = (uint)options.Length,
                Error = 0,
                Options = optionsPointer
            };
            listPointer = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(PerConnectionOptionList)));
            Marshal.StructureToPtr(list, listPointer, false);
            if (!InternetSetOptionW(
                IntPtr.Zero,
                InternetOptionPerConnectionOption,
                listPointer,
                list.Size
            )) {
                throw new Win32Exception(Marshal.GetLastWin32Error());
            }
            NotifyProxySettingsChanged();
        } finally {
            if (listPointer != IntPtr.Zero) Marshal.FreeHGlobal(listPointer);
            if (optionsPointer != IntPtr.Zero) Marshal.FreeHGlobal(optionsPointer);
            if (proxyPointer != IntPtr.Zero) Marshal.FreeHGlobal(proxyPointer);
            if (bypassPointer != IntPtr.Zero) Marshal.FreeHGlobal(bypassPointer);
        }
    }

    public static void NotifyProxySettingsChanged() {
        uint[] options = {
            InternetOptionSettingsChanged,
            InternetOptionProxySettingsChanged,
            InternetOptionRefresh
        };
        foreach (uint option in options) {
            if (!InternetSetOptionW(IntPtr.Zero, option, IntPtr.Zero, 0)) {
                throw new Win32Exception(Marshal.GetLastWin32Error());
            }
        }
    }
}
"@

try {
  if ([string]::IsNullOrWhiteSpace($StateFile)) {
    throw "A system proxy state file is required."
  }

  Add-Type -TypeDefinition $winInetSource

  if ($Action -eq "enable") {
    if ($Port -lt 1 -or $Port -gt 65535) {
      throw "The local proxy port is invalid."
    }
    $stateDirectory = Split-Path -Parent $StateFile
    [System.IO.Directory]::CreateDirectory($stateDirectory) | Out-Null
    if (-not (Test-Path -LiteralPath $StateFile)) {
      $snapshot = [ordered]@{
        Version = 1
        OwnerSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
        InternetSettings = @(Save-RegistryValues $settingsPath @(
          "ProxyEnable",
          "ProxyServer",
          "ProxyOverride",
          "AutoConfigURL",
          "AutoDetect"
        ))
        Connections = @(Save-RegistryValues $connectionsPath @(
          "DefaultConnectionSettings",
          "SavedLegacySettings"
        ))
      }
      $temporaryStateFile = "$StateFile.tmp"
      $snapshotJson = ConvertTo-Json -InputObject $snapshot -Depth 8
      [System.IO.File]::WriteAllText(
        $temporaryStateFile,
        $snapshotJson,
        [System.Text.UTF8Encoding]::new($false)
      )
      if (Test-Path -LiteralPath $StateFile) {
        Remove-Item -LiteralPath $temporaryStateFile -Force
      } else {
        Move-Item -LiteralPath $temporaryStateFile -Destination $StateFile
      }
    }

    $proxy = "http://127.0.0.1:$Port"
    [AeroVpnWinInetProxy]::SetSystemProxy($proxy, $BypassDomain)
    exit 0
  }

  if (-not (Test-Path -LiteralPath $StateFile)) {
    exit 0
  }
  $snapshot = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
  if ($snapshot.Version -ne 1) {
    throw "The saved system proxy state has an unsupported version."
  }
  $currentUserSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  if ($snapshot.OwnerSid -ne $currentUserSid) {
    throw "Sign in as the Windows user who enabled the AeroVPN system proxy before restoring it."
  }
  Restore-RegistryValues $settingsPath @($snapshot.InternetSettings)
  Restore-RegistryValues $connectionsPath @($snapshot.Connections)
  [AeroVpnWinInetProxy]::NotifyProxySettingsChanged()
  Remove-Item -LiteralPath $StateFile -Force
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
