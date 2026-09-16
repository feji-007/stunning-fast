import { useEffect, useState } from 'react'
import UpdateModal, { type UpdatePhase } from './UpdateModal'

// 独立更新弹窗：运行在独立 BrowserWindow 中
// 从 URL 参数读取初始版本信息，通过 IPC 接收主进程推送的更新事件
export default function StandaloneUpdateModal() {
  const [version, setVersion] = useState('')
  const [currentVersion, setCurrentVersion] = useState('')
  const [releaseNotes, setReleaseNotes] = useState<string | undefined>(undefined)
  const [phase, setPhase] = useState<UpdatePhase>('available')
  const [progress, setProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | undefined>(undefined)

  // 从 URL 读取初始数据
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setVersion(params.get('version') ?? '')
    setCurrentVersion(params.get('currentVersion') ?? '')
    const notes = params.get('releaseNotes')
    if (notes) setReleaseNotes(decodeURIComponent(notes))
  }, [])

  // 监听主进程推送的更新事件
  useEffect(() => {
    const off = window.api?.onUpdateWindowEvent?.((data) => {
      if (data.version) setVersion(data.version)
      if (data.currentVersion) setCurrentVersion(data.currentVersion)
      if (data.releaseNotes !== undefined) setReleaseNotes(data.releaseNotes)
      if (data.progress !== undefined) setProgress(data.progress)
      if (data.errorMsg !== undefined) setErrorMsg(data.errorMsg)
      if (data.phase === 'available' || data.phase === 'downloading' || data.phase === 'downloaded' || data.phase === 'error') {
        setPhase(data.phase as UpdatePhase)
      }
    })
    return () => off?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 用户点击"立即更新" → 通知主进程开始下载
  const handleUpdate = () => {
    setPhase('downloading')
    setProgress(0)
    window.api?.downloadUpdate?.().catch(() => {})
  }

  // 稍后提醒 → 关闭独立窗口
  const handleRemindLater = () => {
    window.api?.closeUpdateWindow?.().catch(() => {})
  }

  // 重启安装
  const handleInstall = () => {
    window.api?.installUpdate?.().catch(() => {})
  }

  return (
    <div className="h-screen w-screen">
      <UpdateModal
        version={version}
        phase={phase}
        progress={progress}
        currentVersion={currentVersion}
        releaseNotes={releaseNotes}
        errorMsg={errorMsg}
        onUpdate={handleUpdate}
        onRemindLater={handleRemindLater}
        onInstall={handleInstall}
      />
    </div>
  )
}
