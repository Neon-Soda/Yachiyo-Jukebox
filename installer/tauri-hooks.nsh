; The upstream Tauri template deletes only enumerated program resources and
; removes directories non-recursively. user-data is intentionally unlisted.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "io.yachiyo.desktop"
  ${EndIf}
!macroend
