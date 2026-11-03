!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Xinwei"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "Xinwei"
  MessageBox MB_YESNO|MB_ICONQUESTION "同时清除薪慰的本地工资、作息、偏好和备份？选择否将保留数据供重装使用。" /SD IDNO IDNO xinwei_keep_data
    RMDir /r "$APPDATA\io.xinwei.desktop"
  xinwei_keep_data:
!macroend
