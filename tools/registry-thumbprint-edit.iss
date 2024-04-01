[Code]
const
  ThumbPrint = 'speckleThumbprint2';

function AddThumbPrintToRegistry(): Boolean;
var
  CurrentValues: TStringList;
  RegData: string;
begin
  CurrentValues:= TStringList.Create();
  if RegQueryMultiStringValue(HKLM, 'Software\Policies\Microsoft\Power BI Desktop', 'TrustedCertificateThumbprints', RegData) then
    CurrentValues.Text:= RegData;

  if CurrentValues.IndexOf(ThumbPrint) = -1 then 
  begin
    // If Thumbprint is not already added
    CurrentValues.Add(ThumbPrint);
    RegData:= CurrentValues.Text;
    Result := RegWriteMultiStringvalue(HKLM, 'Software\Policies\Microsoft\Power BI Desktop', 'TrustedCertificateThumbprints', RegData);
  end
  else
    Result := True; // Already exists

  CurrentValues.Free;
end;

function DelThumbPrintFromRegistry(): Boolean;
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
    Index := CurrentValues.IndexOf(ThumbPrint);
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