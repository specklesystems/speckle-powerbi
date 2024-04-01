[Code]
function AddThumbPrintToRegistry(fingerprint: String): Boolean;
var
  CurrentValues: TStringList;
  RegData: string;
begin
  CurrentValues:= TStringList.Create();
  if RegQueryMultiStringValue(HKLM, 'Software\Policies\Microsoft\Power BI Desktop', 'TrustedCertificateThumbprints', RegData) then
    CurrentValues.Text:= RegData;

  if CurrentValues.IndexOf(fingerprint) = -1 then 
  begin
    // If Thumbprint is not already added
    CurrentValues.Add(fingerprint);
    RegData:= CurrentValues.Text;
    Result := RegWriteMultiStringvalue(HKLM, 'Software\Policies\Microsoft\Power BI Desktop', 'TrustedCertificateThumbprints', RegData);
  end
  else
    Result := True; // Already exists

  CurrentValues.Free;
end;

function DelThumbPrintFromRegistry(fingerprint: String): Boolean;
var
  CurrentValues: TStringList;
  Index: Integer;
  RegData: string;
begin
  Result:= True;
  CurrentValues:= TStringList.Create();

  if RegQueryMultiStringValue(HKLM, 'Software\Policies\Microsoft\Power BI Desktop', 'TrustedCertificateThumbprints', RegData) then
  begin
    CurrentValues.Text:= RegData;
    Index := CurrentValues.IndexOf(fingerprint);
    // If found, remove it
    if Index <> -1 then
    begin
      CurrentValues.Delete(Index);
      RegData:= CurrentValues.Text;
      Result := RegWriteMultiStringvalue(HKLM, 'Software\Policies\Microsoft\Power BI Desktop', 'TrustedCertificateThumbprints', RegData);
    end else begin
         MsgBox('Failed to add thumbprint', mbError, MB_OK);
    end;
  end;

  CurrentValues.Free;
end;

#ifdef CODE_SIGNING_CERT_FINGERPRINT
  #define FINGERPRINT=CODE_SIGNING_CERT_FINGERPRINT
#else
  #define FINGERPRINT=AppPublisher
#endif

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
    begin
       // this is the installer
       if not AddThumbPrintToRegistry('{#FINGERPRINT}') then
       MsgBox('Failed to add thumbprint', mbError, MB_OK);
    end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
    begin
        // Remove thumbprint on uninstall
        DelThumbPrintFromRegistry('{#FINGERPRINT}');
    end;
end;

