[Setup]
AppName=WhisperUI
AppVersion=1.0
DefaultDirName={userappdata}\WhisperUI
DefaultGroupName=Whisper UI
OutputBaseFilename=WhisperUIInstaller
Compression=lzma
SolidCompression=yes
PrivilegesRequired=lowest
DisableDirPage=no
UsePreviousAppDir=yes
SetupIconFile=icon.ico
WizardSmallImageFile=icon.bmp

[Files]
Source: "C:\Users\mehta\OneDrive\easy-whisper-ui\build\Final\*"; DestDir: "{app}"; Flags: recursesubdirs

[Code]
// ExitProcess: Ends the installer process immediately.
procedure ExitProcess(uExitCode: Integer);
  external 'ExitProcess@kernel32.dll stdcall';

// Global variables for tracking steps.

var
  StepIndex: Integer;
  TotalSteps: Integer;
  WhisperZip: string;
  WhisperExtracted: string;
  SkipFfmpegInstall: Boolean;

// InitializeWizard: Set up the progress gauge and label positions.
procedure InitializeWizard;
begin
  TotalSteps := 8;
  WizardForm.StatusLabel.Top := WizardForm.ProgressGauge.Top - 30;
  WizardForm.StatusLabel.Font.Style := [];
end;


// RunStep: Executes a command synchronously and updates the UI.
procedure RunStep(const Description, Command: string);
var
  ResultCode: Integer;
begin
  WizardForm.StatusLabel.Caption := Description;
  WizardForm.ProgressGauge.Position := (StepIndex * 100) div TotalSteps;
  if Exec(ExpandConstant('{cmd}'), '/C ' + Command, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    if (ResultCode = 0) then
      WizardForm.StatusLabel.Caption := '✅ ' + Description
    else
      WizardForm.StatusLabel.Caption := '❌ ' + Description + ' (Code ' + IntToStr(ResultCode) + ')';
  end
  else
    WizardForm.StatusLabel.Caption := '❌ ' + Description + ' (Could not execute)';
  StepIndex := StepIndex + 1;
end;

function IsCompilerRunning: Boolean;
var
  ResCode: Integer;
begin
  Result := False;
  if Exec(
    ExpandConstant('{cmd}'),
    '/C tasklist | findstr /R /I "cmake"',
    '',
    SW_HIDE,
    ewWaitUntilTerminated,
    ResCode
  ) then
    Result := (ResCode = 0)
  else
    Result := False;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpReady then
  begin
    WizardForm.ReadyMemo.Lines.Clear;
    WizardForm.ReadyMemo.Lines.Add('Whisper UI will be installed in:');
    WizardForm.ReadyMemo.Lines.Add('  ' + ExpandConstant('{app}'));
    WizardForm.ReadyMemo.Lines.Add('');
    WizardForm.ReadyMemo.Lines.Add('The installer will automatically download and install the following:');
    WizardForm.ReadyMemo.Lines.Add('• Git for Windows (if needed)');
    WizardForm.ReadyMemo.Lines.Add('• Vulkan SDK (if needed)');
    WizardForm.ReadyMemo.Lines.Add('• FFmpeg (if needed)');
    WizardForm.ReadyMemo.Lines.Add('• MSYS2 Compiler (if needed)');
    WizardForm.ReadyMemo.Lines.Add('• Latest whisper.cpp build');
    WizardForm.ReadyMemo.Lines.Add('Installation:');
    WizardForm.ReadyMemo.Lines.Add('• Extract WhisperUI files.');
    WizardForm.ReadyMemo.Lines.Add('• Compile whisper.cpp with Vulkan for your specific hardware.');
  end;
  if CurPageID = wpSelectDir then
  begin
    // Override the disk space label
    WizardForm.DiskSpaceLabel.Caption :=
      'Estimated space required: ~1 GB (if no components are installed).';
  end;
end;



// CurStepChanged: Main installation logic.

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode, I, MaxLoops: Integer;
  TaskCmd: String;
  ExeName: String;
begin
  if CurStep = ssInstall then
  begin
    StepIndex := 0;
    WhisperZip := ExpandConstant('{tmp}\whisper.zip');
    WhisperExtracted := ExpandConstant('{app}\whisper.cpp');
    SkipFfmpegInstall := False;
    
    RunStep('Removing existing folder',
      'powershell -Command "if (Test-Path ''' + ExpandConstant('{app}') + ''' ) { Remove-Item -LiteralPath ''' + ExpandConstant('{app}') + ''' -Recurse -Force }"');
    
    RunStep('Installing Git',
      'powershell -Command "' +
      'try { git --version | Out-Null; $gitExists = $true } catch { $gitExists = $false }; ' +
      'if (-not $gitExists) { ' +
        '$url = ''https://github.com/git-for-windows/git/releases/download/v2.49.0.windows.1/PortableGit-2.49.0-64-bit.7z.exe''; ' +
        '$installer = \"$env:TEMP\\PortableGit-2.49.0-64-bit.7z.exe\"; ' +
        '$dest = \"' + ExpandConstant('{userappdata}') + '\GitPortable\"; ' +
        'curl.exe -L -o $installer $url; ' +
        'Start-Process -FilePath $installer -ArgumentList ''-y -o\"' + ExpandConstant('{userappdata}') + '\GitPortable\"'' -Wait -NoNewWindow; ' +

        '$pathsToAdd = @(' +
          '\"' + ExpandConstant('{userappdata}') + '\GitPortable\cmd\", ' +
          '\"' + ExpandConstant('{userappdata}') + '\GitPortable\bin\", ' +
          '\"' + ExpandConstant('{userappdata}') + '\GitPortable\usr\bin\" ' +
        '); ' +
        '$userPath = [Environment]::GetEnvironmentVariable(\"Path\", \"User\"); ' +
        'foreach ($p in $pathsToAdd) { if ($userPath -notlike \"*\" + $p + \"*\") { $userPath += \";\" + $p } }; ' +
        '[Environment]::SetEnvironmentVariable(\"Path\", $userPath, \"User\"); ' +

        '$home = [Environment]::GetFolderPath(\"UserProfile\"); ' +
        '[Environment]::SetEnvironmentVariable(\"HOME\", $home, \"User\"); ' +

        '$execPath = \"' + ExpandConstant('{userappdata}') + '\GitPortable\libexec\git-core\"; ' +
        '$templatePath = \"' + ExpandConstant('{userappdata}') + '\GitPortable\share\git-core\templates\"; ' +
        '[Environment]::SetEnvironmentVariable(\"GIT_EXEC_PATH\", $execPath, \"User\"); ' +
        '[Environment]::SetEnvironmentVariable(\"GIT_TEMPLATE_DIR\", $templatePath, \"User\") ' +
      '}"');

      
    RunStep('Installing Vulkan SDK',
      'powershell -Command "winget install --id KhronosGroup.VulkanSDK -e --accept-source-agreements --accept-package-agreements"');
      
    RunStep('Setting VULKAN_SDK environment variable',
      'powershell -Command "$v = Get-ItemProperty -Path ''HKLM:\\SOFTWARE\\Khronos\\Vulkan\\RT''; $env:VULKAN_SDK = $v.VulkanSDK; [System.Environment]::SetEnvironmentVariable(''VULKAN_SDK'', $v.VulkanSDK, ''Process'')"');
    if Exec(ExpandConstant('{cmd}'), '/C ffmpeg -version >nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode)
       and (ResultCode = 0) then
    begin
      SkipFfmpegInstall := True;
      WizardForm.StatusLabel.Caption := '✅ FFmpeg already installed';
    end
    else
    begin
    SkipFfmpegInstall := False;
      RunStep('Installing FFmpeg',
        'powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "' +
        '$ffmpegUrl = \"https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-7.0.2-essentials_build.zip\"; ' +
        '$outFile = \"$env:TEMP\\ffmpeg.zip\"; ' +
        '$dest = \"' + ExpandConstant('{userappdata}\ffmpeg') + '\"; ' +
        'curl.exe -L -o $outFile $ffmpegUrl; ' +
        'Expand-Archive -Path $outFile -DestinationPath $dest -Force; ' +
        '$binPath = Get-ChildItem $dest -Directory | Where-Object { $_.Name -like \"ffmpeg-*\" } | Select-Object -First 1 | ForEach-Object { $_.FullName + \"\\bin\" }; ' +
        '$userPath = [Environment]::GetEnvironmentVariable(\"Path\", \"User\"); ' +
        'if ($userPath -notlike \"*\" + $binPath + \"*\") { [Environment]::SetEnvironmentVariable(\"Path\", $userPath + \";\" + $binPath, \"User\") }"');
    end;

    
RunStep('Installing MSYS2 compiler.',
  'powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "' +
  'if (-not (Test-Path ''C:\\msys64\\usr\\bin\\pacman.exe'') -or ' +
          '-not (Test-Path ''C:\\msys64\\mingw64\\bin\\cmake.exe'')) { ' +

    '$url = ''https://github.com/msys2/msys2-installer/releases/latest/download/msys2-base-x86_64-latest.sfx.exe''; ' +
    '$installer = \"$env:TEMP\\msys2.sfx.exe\"; ' +
    '$dest = ''C:\\msys64''; ' +

    'curl.exe -L -o $installer $url; ' +
    'Start-Process -FilePath $installer -ArgumentList ''-y -oC:\\'' -Wait -NoNewWindow; ' +

    'Start-Process -FilePath \"$dest\\usr\\bin\\bash.exe\" -ArgumentList ''--login -c \"pacman -Sy --noconfirm\"'' -Wait -NoNewWindow; ' +
    'Start-Process -FilePath \"$dest\\usr\\bin\\bash.exe\" -ArgumentList ''--login -c \"pacman -S --noconfirm mingw-w64-x86_64-gcc mingw-w64-x86_64-cmake make\"'' -Wait -NoNewWindow; ' +
  '} ' +

  '$msysBin = \"C:\\msys64\\mingw64\\bin\"; ' +
  '$userPath = [Environment]::GetEnvironmentVariable(\"Path\", \"User\"); ' +
  '$pathParts = $userPath -split \";\" | Where-Object { $_ -ne \"\" }; ' +
  '$filteredParts = @(); ' +
  'foreach ($part in $pathParts) { ' +
    'try { ' +
      '$resolved = (Resolve-Path $part -ErrorAction Stop).Path; ' +
      'if ((Test-Path \"$resolved\\cmake.exe\") -and ($resolved -match \"mingw\") -and ($resolved -notmatch \"msys2\")) { continue } ' +
      '$filteredParts += $part ' +
    '} catch { $filteredParts += $part } ' +
  '} ' +
  '$filteredParts += $msysBin; ' +
  '$newPath = ($filteredParts -join \";\"); ' +
  '[Environment]::SetEnvironmentVariable(\"Path\", $newPath, \"User\")' +
  '"');
  
    RunStep('Downloading whisper.cpp ZIP',
      'powershell -Command "curl.exe -L -o \"' + WhisperZip + '\" https://github.com/ggerganov/whisper.cpp/archive/refs/heads/master.zip"');
    
    RunStep('Extracting whisper.cpp ZIP',
      'powershell -Command "Expand-Archive -Path ''' + WhisperZip + ''' -DestinationPath ''' + ExpandConstant('{app}') + ''' -Force"');
    
    RunStep('Renaming extracted folder to whisper.cpp',
      'powershell -Command "Rename-Item -Path ''' + ExpandConstant('{app}') + '\\whisper.cpp-master'' -NewName ''whisper.cpp''"');
  end
  else if CurStep = ssPostInstall then
  begin
    // STATIC BATCH FILE: Run the included build launcher
    TaskCmd :=
      '"' + ExpandConstant('{app}') + '\build.bat"';

    WizardForm.StatusLabel.Caption := 'Launching build process in fresh environment...';
    Exec('explorer.exe', ExpandConstant('{app}') + '\build.bat"', '', SW_HIDE, ewNoWait, ResultCode);

    // Add a small delay to allow the process to start
    Sleep(10000);
    BringToFrontAndRestore;
    
    WizardForm.Show;
    // FAKE LOADING BAR: Check every 0.5 sec up to 100 sec (200 loops)
    WizardForm.StatusLabel.Caption := 'Building whisper.cpp';
    WizardForm.ProgressGauge.Position := 0;
    MaxLoops := 1600;
    for I := 0 to MaxLoops do
    begin
      WizardForm.ProgressGauge.Position := I*12
      WizardForm.Update;
      Sleep(500);
      if not IsCompilerRunning then
        break;
    end;
    WizardForm.ProgressGauge.Position := 1250;
    WizardForm.StatusLabel.Caption := '✅ whisper.cpp build complete';
    BringToFrontAndRestore;
    
    RunStep('Cleaning up',
      'rm ' + ExpandConstant('{app}') + '\build.bat && ' +
      'rm -rf ' + ExpandConstant('{app}') + '\whisper.cpp\build'
   );
  end
  else
  begin
    WizardForm.StatusLabel.Caption := '❌ whisper.cpp build failed or was not launched';
  end
end;
[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked

[Icons]
Name: "{userdesktop}\Whisper UI"; Filename: "{app}\EasyWhisperUI.exe"; Tasks: desktopicon
