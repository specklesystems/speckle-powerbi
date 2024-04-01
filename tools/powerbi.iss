#include "includes\custom-ui.iss"
#include "includes\code-signing.iss"
#include "includes\registry-thumbprint-edit.iss"

#define AppName "Speckle for PowerBI (Data Connector)"
#define Slug "powerbi"

#define BasePath "..\"
#define Bin BasePath + "bin\"

#ifndef Version
    #define Version "2.0.999"
#endif

#ifndef InfoVersion
    #define InfoVersion "2.0.999.9999"
#endif

#define AppPublisher "Speckle"
#define AppURL "https://speckle.systems"
#define UninstallerFolder "{autoappdata}\Speckle\Uninstallers\" + Slug

#define CustomConnectorFolder "{%USERPROFILE}\Documents\Power BI Desktop\Custom Connectors"

[Setup]
AppId={{6759e9e1-8c6b-4974-87c3-bb3c8b8ce619}
; Shouldn't need to update these
AppName={#AppName}
AppVersion={#Version }
AppVerName={#AppName} {#Version}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
AppCopyright=Copyright (C) 2020-2024 AEC SYSTEMS LTD
DefaultDirName={#UninstallerFolder}
VersionInfoVersion={#InfoVersion}
CloseApplications=false
PrivilegesRequired=admin
OutputDir={#Bin}
OutputBaseFilename={#Slug}-{#Version}
; UI
WindowShowCaption=no
WizardSizePercent=100,100
; SetupIconFile=.\InnoSetup\speckle.ico

; Disable wizard pages
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableWelcomePage=yes
DisableFinishedPage=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#Bin}Speckle.pqx"; DestDir: "{#CustomConnectorFolder}"; Flags: signonce;