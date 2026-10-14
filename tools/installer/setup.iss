#define MyAppName "Madden 27 Sportsbook"
#define MyAppVersion "1.8.06"
#define MyAppPublisher "Madden 27 Sportsbook"
#define MyAppExeName "Madden27-Sportsbook.exe"

[Setup]
AppId={{7B9D2E4E-3B9D-4E1E-9A7A-4A2B5B7D2753}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\Madden 27 Sportsbook
UsePreviousAppDir=no
DisableDirPage=no
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=no
OutputDir=..\..\out\installer
OutputBaseFilename=Madden27-Sportsbook-1.8.06-Setup
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
SetupIconFile=..\..\assets\madden27-sportsbook-setup.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
PrivilegesRequired=admin

[Files]
Source: "..\..\out\Madden27-Sportsbook-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Madden 27 Sportsbook"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{autodesktop}\Madden 27 Sportsbook"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch Madden 27 Sportsbook"; Flags: nowait postinstall skipifsilent
