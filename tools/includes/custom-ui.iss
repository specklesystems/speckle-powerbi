; Pascal Code to customize the UI
; More info: https://jrsoftware.org/ishelp/index.php?topic=scriptclasses
[Code]
function RGB(r, g, b: Byte): TColor;
begin
  Result := (Integer(r) or (Integer(g) shl 8) or (Integer(b) shl 16));
end;
procedure InitializeWizard;
begin
  { hide borders & make frameless }
  WizardForm.BorderStyle := bsNone;
  WizardForm.Bevel1.Visible := False;
  WizardForm.Bevel.Visible := False;
  
  { set height with fix for high res displays }
  WizardForm.Height := WizardForm.Font.PixelsPerInch * 140 / 96;

  { hide main panel (top)}
  WizardForm.MainPanel.Height := 0 

  { chage colors }
  WizardForm.Color := RGB(8,121,243);
  WizardForm.InnerPage.Color := RGB(8,121,243);
  WizardForm.ReadyLabel.Font.Color := clWhite;
  WizardForm.StatusLabel.Font.Color := clWhite;  
  WizardForm.FilenameLabel.Font.Color := clWhite; 

  { Stretch the inner page across whole outer page }
  WizardForm.InnerNotebook.Left := 20;
  WizardForm.InnerNotebook.Top := 20;
  WizardForm.InnerNotebook.Width := WizardForm.OuterNotebook.ClientWidth - 40;
  WizardForm.InnerNotebook.Height := WizardForm.OuterNotebook.ClientHeight - 20;
end;
procedure InitializeUninstallProgressForm;
begin
  { hide borders & make frameless }   
  UninstallProgressForm.BorderStyle := bsNone;
  UninstallProgressForm.Bevel1.Visible := False;
  UninstallProgressForm.Bevel.Visible := False;
  
  { set height }
  UninstallProgressForm.Height := UninstallProgressForm.Font.PixelsPerInch * 140 / 96;
  { hide main panel (top)}
  UninstallProgressForm.MainPanel.Height := 0 

  { change colors }
  UninstallProgressForm.Color := RGB(8,121,243);
  UninstallProgressForm.InnerPage.Color := RGB(8,121,243);
  UninstallProgressForm.StatusLabel.Font.Color := clWhite;  

  { Stretch the inner page across whole outer page }
  UninstallProgressForm.InnerNotebook.Left := 20;
  UninstallProgressForm.InnerNotebook.Top := 20;
  UninstallProgressForm.InnerNotebook.Width := UninstallProgressForm.OuterNotebook.ClientWidth - 40;
  UninstallProgressForm.InnerNotebook.Height := UninstallProgressForm.OuterNotebook.ClientHeight - 20;
end;