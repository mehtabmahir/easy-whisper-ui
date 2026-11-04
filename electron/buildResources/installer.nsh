; Preserve newer defaults before the legacy uninstaller restores its backup.
!macro PreserveLegacyMediaExtension ROOT EXT
  ClearErrors
  ReadRegStr $R1 ${ROOT} "Software\Classes\.${EXT}" "Audio/Video for EasyWhisperUI_backup"
  ${IfNot} ${Errors}
    ReadRegStr $R0 ${ROOT} "Software\Classes\.${EXT}" ""
    ${If} $R0 != "Audio/Video for EasyWhisperUI"
      WriteRegStr ${ROOT} "Software\Classes\.${EXT}" "Audio/Video for EasyWhisperUI_backup" "$R0"
    ${EndIf}
  ${EndIf}
!macroend

!macro PreserveLegacyMediaAssociations ROOT
  !insertmacro PreserveLegacyMediaExtension ${ROOT} "wav"
  !insertmacro PreserveLegacyMediaExtension ${ROOT} "mp3"
  !insertmacro PreserveLegacyMediaExtension ${ROOT} "m4a"
  !insertmacro PreserveLegacyMediaExtension ${ROOT} "flac"
  !insertmacro PreserveLegacyMediaExtension ${ROOT} "ogg"
  !insertmacro PreserveLegacyMediaExtension ${ROOT} "opus"
  !insertmacro PreserveLegacyMediaExtension ${ROOT} "aac"
  !insertmacro PreserveLegacyMediaExtension ${ROOT} "wma"
  !insertmacro PreserveLegacyMediaExtension ${ROOT} "mp4"
  !insertmacro PreserveLegacyMediaExtension ${ROOT} "m4v"
  !insertmacro PreserveLegacyMediaExtension ${ROOT} "mov"
  !insertmacro PreserveLegacyMediaExtension ${ROOT} "mkv"
  !insertmacro PreserveLegacyMediaExtension ${ROOT} "avi"
!macroend

!macro customInit
  Push $R0
  Push $R1
  ; initMultiUser selects the registry context before this hook.
  !insertmacro PreserveLegacyMediaAssociations SHELL_CONTEXT
  ${If} $installMode == "all"
    ; All-users upgrades also remove an existing per-user installation.
    !insertmacro PreserveLegacyMediaAssociations HKCU
  ${EndIf}
  Pop $R1
  Pop $R0
!macroend

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
