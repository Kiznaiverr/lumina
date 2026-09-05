; NSIS customInstall hook for the CUDA installer.
;
; electron-builder runs NSIS with `!include` of this file when
; `nsis.include` points at it. The bundled 7zr.exe + ort/cuda.7z live in
; $INSTDIR\resources (extraResources). We extract the archive into
; $INSTDIR\resources\ort\cuda during installation, then delete the archive
; to save ~1.5GB — no first-run extraction, the app starts instantly.
; Runs as the installing user (perMachine=false → no admin needed). Any
; existing extracted folder is removed first (reinstall/upgrade over a
; failed install).

!macro customInstall
  DetailPrint "Extracting CUDA runtime (this can take several minutes)..."
  IfFileExists "$INSTDIR\resources\ort\cuda.7z" 0 +4
    DetailPrint "Removing previous CUDA runtime folder..."
    RMDir /r "$INSTDIR\resources\ort\cuda"
    ExecWait '"$INSTDIR\resources\7zr.exe" x "$INSTDIR\resources\ort\cuda.7z" -o"$INSTDIR\resources\ort\cuda" -y' $0
    StrCmp $0 0 +4
      MessageBox MB_OK|MB_ICONEXCLAMATION "CUDA runtime extraction failed (error $0).$\n$\nThe app will not have CUDA models available. Reinstall to try again." /SD IDOK
      Goto +2
      Delete "$INSTDIR\resources\ort\cuda.7z"
!macroend
