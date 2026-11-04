; Older releases assigned every media extension to this single file class.
; Remove only our legacy defaults, preserving any replacement chosen since.
!macro RestoreLegacyMediaExtension EXT
  ReadRegStr $R0 SHELL_CONTEXT "Software\Classes\.${EXT}" ""
  ${If} $R0 == "Audio/Video for EasyWhisperUI"
    ReadRegStr $R1 SHELL_CONTEXT "Software\Classes\.${EXT}" "Audio/Video for EasyWhisperUI_backup"
    ; Repeated old installs could back up our own association. Never restore it.
    ${If} $R1 == "Audio/Video for EasyWhisperUI"
      StrCpy $R1 ""
    ${EndIf}
    ${If} $R1 == ""
      DeleteRegValue SHELL_CONTEXT "Software\Classes\.${EXT}" ""
    ${Else}
      WriteRegStr SHELL_CONTEXT "Software\Classes\.${EXT}" "" "$R1"
    ${EndIf}
  ${EndIf}
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.${EXT}" "Audio/Video for EasyWhisperUI_backup"
!macroend

!macro RemoveLegacyMediaAssociations
  Push $R0
  Push $R1
  !insertmacro RestoreLegacyMediaExtension "wav"
  !insertmacro RestoreLegacyMediaExtension "mp3"
  !insertmacro RestoreLegacyMediaExtension "m4a"
  !insertmacro RestoreLegacyMediaExtension "flac"
  !insertmacro RestoreLegacyMediaExtension "ogg"
  !insertmacro RestoreLegacyMediaExtension "opus"
  !insertmacro RestoreLegacyMediaExtension "aac"
  !insertmacro RestoreLegacyMediaExtension "wma"
  !insertmacro RestoreLegacyMediaExtension "mp4"
  !insertmacro RestoreLegacyMediaExtension "m4v"
  !insertmacro RestoreLegacyMediaExtension "mov"
  !insertmacro RestoreLegacyMediaExtension "mkv"
  !insertmacro RestoreLegacyMediaExtension "avi"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Audio/Video for EasyWhisperUI"
  System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
  Pop $R1
  Pop $R0
!macroend

!macro customInstall
  ; Runs after the old uninstaller, which may restore a stale self-backup.
  !insertmacro RemoveLegacyMediaAssociations
!macroend

!macro customUnInstall
  !insertmacro RemoveLegacyMediaAssociations
!macroend
