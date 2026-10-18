#ifndef SourceRoot
  #error SourceRoot must be provided by the package script
#endif
#ifndef AppDirectory
  #error AppDirectory must be provided by the package script
#endif
#ifndef OutputDirectory
  #error OutputDirectory must be provided by the package script
#endif
#ifndef AppVersion
  #error AppVersion must be provided by the package script
#endif
#ifndef ArtifactArchitecture
  #error ArtifactArchitecture must be provided by the package script
#endif
#ifndef SetupSuffix
  #define SetupSuffix ""
#endif

#if Int(ArtifactArchitecture) == 64
  #define ArchitectureLabel "x64"
#elif Int(ArtifactArchitecture) == 32
  #define ArchitectureLabel "x86"
#elif Int(ArtifactArchitecture) == 128
  #define ArchitectureLabel "arm64"
#else
  #error Unsupported Windows artifact architecture
#endif

#define LayoutRegistryKey "SOFTWARE\SagerNet\sing-box"
#define LegacyAppGuid "b04debae-1e49-5a92-ae01-360bcd3e85c5"
#define LegacyInstallRegistryKey "Software\{#LegacyAppGuid}"
#define LegacyUninstallRegistryKey "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#LegacyAppGuid}"

[Setup]
AppId={{b04debae-1e49-5a92-ae01-360bcd3e85c5}}
AppName=AeroVPN
AppVersion={#AppVersion}
AppPublisher=AeroVPN
AppPublisherURL=https://github.com/dannisiai/AeroVPN-Desktop
AppSupportURL=https://github.com/dannisiai/AeroVPN-Desktop/issues
AppUpdatesURL=https://github.com/dannisiai/AeroVPN-Desktop/releases
DefaultDirName={autopf}\AeroVPN
DefaultGroupName=AeroVPN
DisableProgramGroupPage=yes
UsePreviousAppDir=yes
AllowNoIcons=yes
PrivilegesRequired=admin
#if ArtifactArchitecture == "x64"
ArchitecturesAllowed=x64os
ArchitecturesInstallIn64BitMode=x64os
#elif ArtifactArchitecture == "x86"
ArchitecturesAllowed=x86os
#elif ArtifactArchitecture == "arm64"
ArchitecturesAllowed=arm64
ArchitecturesInstallIn64BitMode=arm64
#endif
SetupIconFile={#SourceRoot}\resources\icon.ico
UninstallDisplayName=AeroVPN
UninstallDisplayIcon={app}\AeroVPN.exe
LicenseFile={#SourceRoot}\LICENSE
OutputDir={#OutputDirectory}
OutputBaseFilename=AeroVPN-{#AppVersion}{#SetupSuffix}-{#ArchitectureLabel}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
ChangesAssociations=yes
SetupLogging=yes
SignTool=ci
SignedUninstaller=yes
ShowLanguageDialog=no
VersionInfoVersion={#AppVersion}.0
VersionInfoCompany=AeroVPN
VersionInfoDescription=AeroVPN Windows Installer
VersionInfoProductName=AeroVPN
VersionInfoProductVersion={#AppVersion}.0

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopShortcut}"; GroupDescription: "{cm:AdditionalShortcuts}"; Flags: unchecked

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "chinesesimplified"; MessagesFile: "{#SourceRoot}\build\inno-languages\ChineseSimplified.isl"

[CustomMessages]
english.CreateDesktopShortcut=Create a desktop shortcut
chinesesimplified.CreateDesktopShortcut=创建桌面快捷方式
english.AdditionalShortcuts=Additional shortcuts:
chinesesimplified.AdditionalShortcuts=其他快捷方式：
english.LaunchAeroVPN=Launch AeroVPN
chinesesimplified.LaunchAeroVPN=启动 AeroVPN

[Files]
Source: "{#AppDirectory}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceRoot}\build\installer-preflight.ps1"; DestDir: "{tmp}"; Flags: dontcopy
Source: "{#SourceRoot}\build\installer-service.ps1"; DestDir: "{tmp}"; Flags: dontcopy
Source: "{#SourceRoot}\build\installer-guid.ps1"; DestDir: "{tmp}"; Flags: dontcopy

[Icons]
Name: "{autoprograms}\AeroVPN"; Filename: "{app}\AeroVPN.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\AeroVPN"; Filename: "{app}\AeroVPN.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\AeroVPN.exe"; Description: "{cm:LaunchAeroVPN}"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent runasoriginaluser

[Code]
const
  LayoutRegistryKey = 'SOFTWARE\SagerNet\sing-box';
  LegacyInstallRegistryKey = 'Software\b04debae-1e49-5a92-ae01-360bcd3e85c5';
  LegacyUninstallRegistryKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\b04debae-1e49-5a92-ae01-360bcd3e85c5';
  TaildropRegistryKey = 'Software\Classes\*\shell\Taildrop';
  ProfileProgID = 'AeroVPN.Profile';

var
  ApplicationDataDirectory: String;
  DaemonDataDirectory: String;
  InstallationID: String;
  LegacyInstallDirectory: String;

function NewInstallationID: String;
var
  ResultCode: Integer;
  Started: Boolean;
  OutputPath: String;
  Parameters: String;
  IDContents: AnsiString;
begin
  Result := '';
  ExtractTemporaryFile('installer-guid.ps1');
  OutputPath := ExpandConstant('{tmp}\aerovpn-installation-id.txt');
  DeleteFile(OutputPath);
  Parameters := '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' +
    ExpandConstant('{tmp}\installer-guid.ps1') + '" -OutputPath "' + OutputPath + '"';
  Started := Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    Parameters, '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  if Started and (ResultCode = 0) and LoadStringFromFile(OutputPath, IDContents) then
    Result := Trim(String(IDContents));
  DeleteFile(OutputPath);
end;

procedure SetAeroVPNRegistryView;
begin
  if IsWin64 then
    SetRegView(64)
  else
    SetRegView(32);
end;

procedure ReadInstallationLayout(StrictLayout: Boolean);
var
  LayoutVersion: Cardinal;
begin
  SetAeroVPNRegistryView;
  ApplicationDataDirectory := '';
  DaemonDataDirectory := ExpandConstant('{commonappdata}\sing-box-daemon');
  InstallationID := '';
  RegQueryStringValue(HKLM, LegacyInstallRegistryKey, 'InstallLocation', LegacyInstallDirectory);
  if RegQueryDWordValue(HKLM, LayoutRegistryKey, 'LayoutVersion', LayoutVersion) then begin
    if LayoutVersion = 2 then begin
      RegQueryStringValue(HKLM, LayoutRegistryKey, 'ApplicationDataDirectory', ApplicationDataDirectory);
      RegQueryStringValue(HKLM, LayoutRegistryKey, 'DaemonDataDirectory', DaemonDataDirectory);
      RegQueryStringValue(HKLM, LayoutRegistryKey, 'InstallationID', InstallationID);
    end else if StrictLayout then
      RaiseException('Unsupported AeroVPN installation data layout.');
  end;
  if DaemonDataDirectory = '' then
    DaemonDataDirectory := ExpandConstant('{commonappdata}\sing-box-daemon');
  if InstallationID = '' then begin
    if StrictLayout then
      InstallationID := NewInstallationID
    else
      RaiseException('Could not read the AeroVPN installation identifier.');
  end;
  if InstallationID = '' then
    RaiseException('Could not create an AeroVPN installation identifier.');
end;

function RunPowerShell(const Parameters: String; var ResultCode: Integer): Boolean;
begin
  Result := Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    Parameters, '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

function RunLegacyUninstaller(var ResultCode: Integer): Boolean;
var
  CommandLine: String;
  FileName: String;
  Parameters: String;
  Delimiter: Integer;
begin
  Result := False;
  if not RegQueryStringValue(HKLM, LegacyUninstallRegistryKey, 'QuietUninstallString', CommandLine) then
    if not RegQueryStringValue(HKLM, LegacyUninstallRegistryKey, 'UninstallString', CommandLine) then
      Exit;

  CommandLine := Trim(CommandLine);
  if CommandLine = '' then
    Exit;
  if Copy(CommandLine, 1, 1) = '"' then begin
    Delete(CommandLine, 1, 1);
    Delimiter := Pos('"', CommandLine);
    if Delimiter = 0 then
      Exit;
    FileName := Copy(CommandLine, 1, Delimiter - 1);
    Parameters := Trim(Copy(CommandLine, Delimiter + 1, Length(CommandLine)));
  end else begin
    Delimiter := Pos(' ', CommandLine);
    if Delimiter = 0 then begin
      FileName := CommandLine;
      Parameters := '';
    end else begin
      FileName := Copy(CommandLine, 1, Delimiter - 1);
      Parameters := Trim(Copy(CommandLine, Delimiter + 1, Length(CommandLine)));
    end;
  end;

  if not FileExists(FileName) then
    Exit;
  if (Pos('/S', Uppercase(Parameters)) = 0) and (Pos('/SILENT', Uppercase(Parameters)) = 0) then
    Parameters := Trim(Parameters + ' /S');
  Result := Exec(FileName, Parameters, ExtractFileDir(FileName), SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

function PreflightParameters: String;
begin
  Result := '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' +
    ExpandConstant('{tmp}\installer-preflight.ps1') +
    '" -InstallationDirectory "' + WizardDirValue +
    '" -DaemonWorkingDirectory "' + DaemonDataDirectory +
    '" -InstallationID "' + InstallationID + '"';
  if ApplicationDataDirectory <> '' then
    Result := Result + ' -ApplicationDataDirectory "' + ApplicationDataDirectory +
      '" -PrepareApplicationDataDirectory';
end;

function UninstallDataParameters: String;
begin
  Result := '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' +
    ExpandConstant('{tmp}\installer-preflight.ps1') +
    '" -InstallationDirectory "' + ExpandConstant('{app}') +
    '" -DaemonWorkingDirectory "' + DaemonDataDirectory +
    '" -InstallationID "' + InstallationID +
    '" -AllowUnsafeInstallationDirectory -DeleteDataDirectories';
  if ApplicationDataDirectory <> '' then
    Result := Result + ' -ApplicationDataDirectory "' + ApplicationDataDirectory + '"'
  else
    Result := Result + ' -DeleteDefaultApplicationDataDirectory -DefaultApplicationDataDirectory "' +
      ExpandConstant('{userappdata}\sing-box') + '"';
end;

function StopExistingService: Boolean;
var
  ResultCode: Integer;
  Parameters: String;
begin
  Parameters := '-NoProfile -NonInteractive -Command "$ErrorActionPreference = ''Stop''; ' +
    '$service = Get-Service -Name ''sing-box-daemon'' -ErrorAction SilentlyContinue; ' +
    'if ($null -ne $service) { Stop-Service -Name ''sing-box-daemon'' -Force -ErrorAction Stop; ' +
    '$service.WaitForStatus([System.ServiceProcess.ServiceControllerStatus]::Stopped, ' +
    '[TimeSpan]::FromSeconds(10)) }"';
  Result := RunPowerShell(Parameters, ResultCode) and (ResultCode = 0);
end;

function InitializeSetup: Boolean;
begin
  ReadInstallationLayout(True);
  Result := True;
end;

procedure InitializeWizard;
begin
  ExtractTemporaryFile('installer-preflight.ps1');
  ExtractTemporaryFile('installer-service.ps1');
  if (LegacyInstallDirectory <> '') and DirExists(LegacyInstallDirectory) then
    WizardForm.DirEdit.Text := LegacyInstallDirectory;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
  Started: Boolean;
begin
  Result := '';
  if not RunPowerShell(PreflightParameters, ResultCode) then begin
    Result := 'Could not start AeroVPN directory validation.';
    Exit;
  end;
  if ResultCode <> 0 then begin
    Result := 'AeroVPN could not safely prepare the selected installation and service directories. Error code: ' + IntToStr(ResultCode);
    Exit;
  end;

  if not StopExistingService then begin
    Result := 'The existing AeroVPN service could not be stopped.';
    Exit;
  end;

  if RegKeyExists(HKLM, LegacyUninstallRegistryKey) then begin
    Started := RunLegacyUninstaller(ResultCode);
    if Started and (ResultCode <> 0) then begin
      Result := 'The previous AeroVPN installer could not be removed. Error code: ' + IntToStr(ResultCode);
      Exit;
    end;
  end;
end;

function RunServiceHelper(const Action: String; var ResultCode: Integer): Boolean;
var
  Parameters: String;
  OutputPath: String;
begin
  OutputPath := ExpandConstant('{tmp}\aerovpn-service-command.log');
  Parameters := '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' +
    ExpandConstant('{tmp}\installer-service.ps1') +
    '" -ExecutablePath "' + ExpandConstant('{app}\resources\daemon\aerovpn-service.exe') +
    '" -ServiceAction ' + Action + ' -OutputPath "' + OutputPath +
    '" -DaemonDataDirectory "' + DaemonDataDirectory + '"';
  Result := RunPowerShell(Parameters, ResultCode);
end;

procedure RegisterAeroVPNAssociations;
var
  CurrentProgID: String;
begin
  if not RegQueryStringValue(HKEY_CLASSES_ROOT, '.bpf', '', CurrentProgID) or
     (CurrentProgID = '') or (CurrentProgID = ProfileProgID) then begin
    RegWriteStringValue(HKEY_CLASSES_ROOT, '.bpf', '', ProfileProgID);
    RegWriteStringValue(HKEY_CLASSES_ROOT, ProfileProgID, '', 'AeroVPN profile');
    RegWriteStringValue(HKEY_CLASSES_ROOT, ProfileProgID + '\DefaultIcon', '',
      ExpandConstant('{app}\AeroVPN.exe,0'));
    RegWriteStringValue(HKEY_CLASSES_ROOT, ProfileProgID + '\shell\open\command', '',
      '"' + ExpandConstant('{app}\AeroVPN.exe') + '" "%1"');
  end;
  RegWriteStringValue(HKLM, TaildropRegistryKey, '', '使用 AeroVPN 发送');
  RegWriteStringValue(HKLM, TaildropRegistryKey, 'Icon', ExpandConstant('{app}\AeroVPN.exe,0'));
  RegWriteStringValue(HKLM, TaildropRegistryKey, 'MultiSelectModel', 'Player');
  RegWriteStringValue(HKLM, TaildropRegistryKey + '\command', '',
    '"' + ExpandConstant('{app}\AeroVPN.exe') + '" --taildrop-send="%1"');
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssPostInstall then begin
    if not RunServiceHelper('install', ResultCode) then
      RaiseException('Could not start the AeroVPN service registration command.');
    if ResultCode <> 0 then
      RaiseException('AeroVPN service registration failed with code ' + IntToStr(ResultCode) + '.');

    SetAeroVPNRegistryView;
    RegWriteDWordValue(HKLM, LayoutRegistryKey, 'LayoutVersion', 2);
    RegWriteStringValue(HKLM, LayoutRegistryKey, 'InstallationID', InstallationID);
    if ApplicationDataDirectory = '' then
      RegDeleteValue(HKLM, LayoutRegistryKey, 'ApplicationDataDirectory')
    else
      RegWriteStringValue(HKLM, LayoutRegistryKey, 'ApplicationDataDirectory', ApplicationDataDirectory);
    RegWriteStringValue(HKLM, LayoutRegistryKey, 'DaemonDataDirectory', DaemonDataDirectory);
    RegWriteStringValue(HKLM, LegacyInstallRegistryKey, 'InstallLocation', ExpandConstant('{app}'));
    RegDeleteKeyIncludingSubkeys(HKLM, LegacyUninstallRegistryKey);
    RegisterAeroVPNAssociations;
  end;
end;

function InitializeUninstall: Boolean;
begin
  ReadInstallationLayout(False);
  ExtractTemporaryFile('installer-preflight.ps1');
  ExtractTemporaryFile('installer-service.ps1');
  Result := True;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
  Started: Boolean;
  DataCleanupStarted: Boolean;
  ExistingProgID: String;
begin
  if CurUninstallStep = usUninstall then begin
    if FileExists(ExpandConstant('{app}\resources\daemon\aerovpn-service.exe')) then begin
      if not RunServiceHelper('uninstall', ResultCode) then
        RaiseException('Could not start the AeroVPN service removal command.');
      if ResultCode <> 0 then
        RaiseException('AeroVPN service removal failed with code ' + IntToStr(ResultCode) + '.');
    end else begin
      Started := Exec(ExpandConstant('{sys}\sc.exe'), 'stop sing-box-daemon', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      Started := Exec(ExpandConstant('{sys}\sc.exe'), 'delete sing-box-daemon', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    end;
    DataCleanupStarted := RunPowerShell(UninstallDataParameters, ResultCode);
    if not DataCleanupStarted then
      RaiseException('Could not start AeroVPN user data cleanup.')
    else if ResultCode <> 0 then
      RaiseException('AeroVPN user data cleanup failed with code ' + IntToStr(ResultCode) + '.');
    RegDeleteKeyIncludingSubkeys(HKLM, TaildropRegistryKey);
    if RegQueryStringValue(HKEY_CLASSES_ROOT, '.bpf', '', ExistingProgID) and
       (ExistingProgID = ProfileProgID) then
      RegDeleteValue(HKEY_CLASSES_ROOT, '.bpf', '');
    RegDeleteKeyIncludingSubkeys(HKEY_CLASSES_ROOT, ProfileProgID);
  end;
end;
