#include "includes\custom-ui.iss"

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

#define CustomConnectorFolder "{userdocs}\Power BI Desktop\Custom Connectors"

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
OutputDir={#Bin}
OutputBaseFilename={#Slug}-{#Version}
; UI
WindowShowCaption=no
WizardSizePercent=100,100
; SetupIconFile=.\InnoSetup\speckle.ico
PrivilegesRequired=lowest
; Disable wizard pages
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableWelcomePage=yes
DisableFinishedPage=yes


#include "includes\code-signing.iss"

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#Bin}Speckle.pqx"; DestDir: "{#CustomConnectorFolder}";

; TODO: Including the thumbprint in the registry will enable this running in higher security environments.
; Currently blocked because of MakePQX.exe not being ready to work with online CSP's like Digicert Keylocker.
; #include "includes\registry-thumbprint-edit.iss"
