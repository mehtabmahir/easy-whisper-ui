[Setup]
AppName=Whisper UI Application
AppVersion=1.0
DefaultDirName={userappdata}\WhisperUI
DefaultGroupName=Whisper UI
OutputBaseFilename=WhisperUIInstaller
Compression=lzma
SolidCompression=yes
PrivilegesRequired=lowest
DisableDirPage=no
UsePreviousAppDir=yes

[Files]
Source: "C:\Users\mehta\OneDrive\easy-whisper-ui\build\Final\*"; DestDir: "{app}"; Flags: recursesubdirs

[Code]
procedure ExitProcess(uExitCode: Integer);
  external 'ExitProcess@kernel32.dll stdcall';

var
  StepIndex: Integer;
  TotalSteps: Integer;
  WhisperZip: string;
  WhisperExtracted: string;
  SkipFfmpegInstall: Boolean;

procedure InitializeWizard;
begin
  TotalSteps := 15;
  WizardForm.StatusLabel.Top := WizardForm.ProgressGauge.Top - 30;
  WizardForm.StatusLabel.Font.Style := [fsBold];
end;

procedure RunStep(const Description, Command: string);
var
  ResultCode: Integer;
begin
  WizardForm.StatusLabel.Caption := '🔹 ' + Description;
  WizardForm.ProgressGauge.Position := (StepIndex * 100) div TotalSteps;
  if Exec(ExpandConstant('{cmd}'), '/C ' + Command, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    if ResultCode = 0 then
      WizardForm.StatusLabel.Caption := '✅ ' + Description
    else
      WizardForm.StatusLabel.Caption := '❌ ' + Description + ' (Code ' + IntToStr(ResultCode) + ')';
  end
  else
    WizardForm.StatusLabel.Caption := '❌ ' + Description + ' (Could not execute)';
  StepIndex := StepIndex + 1;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssInstall then
  begin
    StepIndex := 0;
    WhisperZip := ExpandConstant('{tmp}') + '\whisper.zip';
    WhisperExtracted := ExpandConstant('{app}') + '\whisper.cpp';
    SkipFfmpegInstall := False;

    // Check that Git is installed
    if not Exec(ExpandConstant('{cmd}'), '/C git --version >nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
    begin
      MsgBox('Git is required to compile whisper.cpp. Please install Git for Windows and run this installer again.                                     Recommended: cmd -> winget install Git.Git', mbError, MB_OK);
      ExitProcess(1);
    end;

    RunStep('Removing existing folder',
      'powershell -Command "if (Test-Path ''' + ExpandConstant('{app}') + ''' ) { Remove-Item -LiteralPath ''' + ExpandConstant('{app}') + ''' -Recurse -Force }"');
      
    RunStep('Checking/Installing Vulkan SDK',
      'powershell -Command "winget install --id KhronosGroup.VulkanSDK -e --accept-source-agreements --accept-package-agreements"');

    RunStep('Setting VULKAN_SDK environment variable',
      'powershell -Command "$v = Get-ItemProperty -Path ''HKLM:\\SOFTWARE\\Khronos\\Vulkan\\RT''; $env:VULKAN_SDK = $v.VulkanSDK; [System.Environment]::SetEnvironmentVariable(''VULKAN_SDK'', $v.VulkanSDK, ''Process'')"');

    // Check for FFmpeg presence
    if Exec(ExpandConstant('{cmd}'), '/C ffmpeg -version >nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0) then
      begin
        SkipFfmpegInstall := True;
        WizardForm.StatusLabel.Caption := '✅ FFmpeg already installed';
      end
    else
      begin
        SkipFfmpegInstall := False;
        RunStep('Installing FFmpeg and adding to PATH',
          'powershell -Command "' +
          '$ffmpegUrl = \"https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-7.0.2-essentials_build.zip\"; ' +
          '$outFile = \"$env:TEMP\\ffmpeg.zip\"; ' +
          '$dest = \"' + ExpandConstant('{userappdata}\ffmpeg') + '\"; ' +
          'Invoke-WebRequest -Uri $ffmpegUrl -OutFile $outFile; ' +
          'Expand-Archive -Path $outFile -DestinationPath $dest -Force; ' +
          '$binPath = Get-ChildItem $dest -Directory | Where-Object { $_.Name -like \"ffmpeg-*\" } | Select-Object -First 1 | ForEach-Object { $_.FullName + \"\\bin\" }; ' +
          '$userPath = [Environment]::GetEnvironmentVariable(\"Path\", \"User\"); ' +
          'if ($userPath -notlike \"*\" + $binPath + \"*\") { ' +
          '[Environment]::SetEnvironmentVariable(\"Path\", $userPath + \";\" + $binPath, \"User\") }"');
      end;


    RunStep('Installing Visual Studio Community 2022',
      'powershell -Command "winget install --id Microsoft.VisualStudio.2022.Community --override \"--add Microsoft.VisualStudio.Workload.NativeDesktop --includeRecommended --passive\" -e --accept-source-agreements --accept-package-agreements; ' +
      'Write-Host Waiting for Visual Studio to finish...; ' +
      'do { Start-Sleep -Seconds 10 } while (Get-Process | Where-Object { $_.ProcessName -like ''vs_installer'' -or $_.ProcessName -like ''setup'' })"');
    
    RunStep('Downloading whisper.cpp ZIP',
      'powershell -Command "Invoke-WebRequest -Uri https://github.com/ggerganov/whisper.cpp/archive/refs/heads/master.zip -OutFile ''' + WhisperZip + '''"');

    RunStep('Extracting whisper.cpp ZIP',
      'powershell -Command "Expand-Archive -Path ''' + WhisperZip + ''' -DestinationPath ''' + ExpandConstant('{app}') + ''' -Force"');

    RunStep('Renaming extracted folder to whisper.cpp',
      'powershell -Command "Rename-Item -Path ''' + ExpandConstant('{app}') + '\whisper.cpp-master'' -NewName ''whisper.cpp''"');

    RunStep('Configuring whisper.cpp build',
      'cd /d "' + WhisperExtracted + '" && "' +
      'C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe' +
      '" -B build -DGGML_VULKAN=1 -DCMAKE_BUILD_TYPE=Release');

    RunStep('Building whisper.cpp',
      'cd /d "' + WhisperExtracted + '" && "' +
      'C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe' +
      '" --build build --config Release');

    RunStep('Copying compiled binaries',
      'xcopy /y "' + WhisperExtracted + '\build\bin\Release\*" "' + ExpandConstant('{app}') + '\\"');
  end;
end;

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked

[Icons]
Name: "{userdesktop}\Whisper UI"; Filename: "{app}\EasyWhisperUI.exe"; Tasks: desktopicon