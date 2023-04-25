#include "custom-ui.iss"

#define AppName "Speckle for PowerBI (Data Connector)"
#define Slug "powerbi"

#define BasePath "..\"
#define Bin BasePath + "bin\"

#define AppVersion "2.0.0"
#define AppInfoVersion "2.0.0.1234"
#define AppPublisher "Speckle"
#define AppURL "https://speckle.systems"
#define UninstallerFolder "{autoappdata}\Speckle\Uninstallers\" + Slug

#define CustomConnectorFolder "{%USERPROFILE}\Documents\Power BI Desktop\Custom Connectors"
#define PFX_PSW GetEnv('PFX_PSW') 

[Setup]
AppId={{6759e9e1-8c6b-4974-87c3-bb3c8b8ce619}
; Shouldn't need to update these
AppName={#AppName}
AppVersion={#AppInfoVersion }
AppVerName={#AppName} {#AppInfoVersion }
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
AppCopyright=Copyright (C) 2020-2022 AEC SYSTEMS LTD
DefaultDirName={#UninstallerFolder}
VersionInfoVersion={#AppVersion}
ChangesAssociations=yes
CloseApplications=false
PrivilegesRequired=admin
OutputBaseFilename={#Slug}
OutputDir={#Bin}
; Needed so that the rhino registry key is put in the right location
ArchitecturesInstallIn64BitMode=x64

; UI
WindowShowCaption=no
WizardSizePercent=100,100
; SetupIconFile=.\InnoSetup\speckle.ico

; Disable wizard pages
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableWelcomePage=yes
DisableFinishedPage=yes

SignTool=byparam {#BasePath}tools\SignTool\signtool.exe sign /f $q{#BasePath}tools\SignTool\AEC Systems Ltd.pfx$q /p {#PFX_PSW} /tr http://timestamp.digicert.com /td sha256 /fd sha256 $f

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#Bin}Speckle.pqx"; DestDir: "{#CustomConnectorFolder}";

[Registry]

Root: HKLM; Subkey: "Software\Policies\Microsoft\Power BI Desktop"; ValueType: multisz; ValueName: "TrustedCertificateThumbprints"; ValueData: "4797ACC22464ED1CF9AFF4C09C2CCF4CF1873EFB"; Flags: uninsdeletekey
