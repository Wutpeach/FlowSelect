!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Downloading and configuring FlowSelect runtime components. This may take a moment..."
  ClearErrors
  ExecWait '"$INSTDIR\FlowSelect.exe" --bootstrap-runtimes --noninteractive --exit' $0

  IfErrors installer_runtime_prewarm_spawn_failed installer_runtime_prewarm_check_exit_code

  installer_runtime_prewarm_spawn_failed:
    DetailPrint "FlowSelect runtime prewarm could not start during installation. The app will retry on first launch."
    ClearErrors
    Goto installer_runtime_prewarm_done

  installer_runtime_prewarm_check_exit_code:
    StrCmp $0 "0" installer_runtime_prewarm_success installer_runtime_prewarm_failed

  installer_runtime_prewarm_failed:
    DetailPrint "FlowSelect runtime prewarm did not finish during installation. The app will retry on first launch."
    Goto installer_runtime_prewarm_done

  installer_runtime_prewarm_success:
    DetailPrint "FlowSelect runtime components are ready."

  installer_runtime_prewarm_done:
!macroend
