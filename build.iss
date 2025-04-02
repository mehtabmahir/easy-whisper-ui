[Setup]
AppName=Whisper UI Build
AppVersion=1.0
DefaultDirName={param:installdir}
DisableDirPage=yes
DisableWelcomePage=yes
DisableReadyPage=yes
DisableFinishedPage=yes
OutputBaseFilename=WhisperUIBuildOnlyInstaller
Compression=lzma
SolidCompression=yes
PrivilegesRequired=lowest

[Code]
var
  WhisperExtracted: string;

procedure RunStep(const Description, Command: string);
var
  ResultCode: Integer;
begin
  WizardForm.StatusLabel.Caption := '🔹 ' + Description;
  if Exec(ExpandConstant('{cmd}'), '/C ' + Command, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    if ResultCode = 0 then
      WizardForm.StatusLabel.Caption := '✅ ' + Description
    else
      WizardForm.StatusLabel.Caption := '❌ ' + Description + ' (Code ' + IntToStr(ResultCode) + ')';
  end
  else
    WizardForm.StatusLabel.Caption := '❌ ' + Description + ' (Could not execute)';
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
  begin
    WhisperExtracted := ExpandConstant('{app}') + '\whisper.cpp';

    RunStep('Configuring whisper.cpp build',
      'cd /d "' + WhisperExtracted + '" && C:\msys64\mingw64\bin\cmake.exe -B build -DGGML_VULKAN=1 -DCMAKE_BUILD_TYPE=Release');

    RunStep('Building whisper.cpp',
      'cd /d "' + WhisperExtracted + '" && C:\msys64\mingw64\bin\cmake.exe --build build --config Release');

    RunStep('Copying compiled binaries',
      'xcopy /y "' + WhisperExtracted + '\build\bin\*" "' + ExpandConstant('{app}') + '\\"');
  end;
end;


[Run]
Filename: "{app}\EasyWhisperUI.exe"; Description: "Launch Whisper UI"; Flags: nowait postinstall skipifsilent
