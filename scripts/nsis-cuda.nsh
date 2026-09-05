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
;
; Extraction uses Nsis7z::Extract — the same plugin electron-builder itself
; uses to unpack the app package (see templates/nsis/include/extractAppPackage.nsh).
; It extracts inside the installer process: the native progress bar moves
; during the ~2GB runtime extraction, no console window, no scary terminal.
; SetOutPath selects the target directory (the plugin extracts to $OUTDIR).

!macro customInstall
  ; installSection.nsh sets SetDetailsPrint none for the whole install —
  ; re-enable so the extraction message and progress reach the UI.
  SetDetailsPrint both
  DetailPrint "Extracting CUDA runtime (this can take several minutes)..."
  IfFileExists "$INSTDIR\resources\ort\cuda.7z" 0 lumina_cuda_noarchive
    DetailPrint "Removing previous CUDA runtime folder..."
    RMDir /r "$INSTDIR\resources\ort\cuda"
    SetOutPath "$INSTDIR\resources\ort\cuda"
    Nsis7z::Extract "$INSTDIR\resources\ort\cuda.7z"
    Pop $0
    StrCmp $0 0 lumina_cuda_ok
      MessageBox MB_OK|MB_ICONEXCLAMATION "CUDA runtime extraction failed (error $0).$\n$\nThe app will not have CUDA models available. Reinstall to try again." /SD IDOK
      Goto lumina_cuda_done
    lumina_cuda_ok:
      Delete "$INSTDIR\resources\ort\cuda.7z"
      DetailPrint "CUDA runtime extracted."
      Goto lumina_cuda_done
  lumina_cuda_noarchive:
    DetailPrint "CUDA archive not found — skipping extraction."
  lumina_cuda_done:
!macroend
