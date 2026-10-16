export type UpdatePhase = 'available' | 'downloading' | 'downloaded' | 'error'

interface UpdateModalProps {
  version: string
  phase: UpdatePhase
  progress: number // 0~100
  currentVersion?: string
  releaseNotes?: string
  errorMsg?: string
  onUpdate: () => void
  onRemindLater: () => void
  onInstall: () => void
}

// 格式化下载速度
function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return ''
  if (bytesPerSecond < 1024) return `${bytesPerSecond} B/s`
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSecond / 1024 / 1024).toFixed(2)} MB/s`
}

// 格式化已下载/总大小
function formatSize(bytes: number): string {
  if (bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export default function UpdateModal({
  version,
  phase,
  progress,
  currentVersion,
  releaseNotes,
  errorMsg,
  onUpdate,
  onRemindLater,
  onInstall
}: UpdateModalProps) {
  const isDownloading = phase === 'downloading'
  const isDownloaded = phase === 'downloaded'
  const isError = phase === 'error'

  // 所有阶段统一使用紧凑横向布局，适配 280×52 小窗口
  // 外层容器占满窗口并带圆角，确保透明窗口边缘呈圆弧
  return (
    <div className="flex h-full w-full items-center justify-center rounded-full bg-white shadow-lg">
      <div className="relative flex items-center gap-2.5 px-3.5 py-2">
        <span className="text-sm">
          {isError ? '⚠️' : isDownloaded ? '✅' : '🚀'}
        </span>

        <span className="whitespace-nowrap text-xs font-medium text-gray-800">
          {isError
            ? '更新失败'
            : isDownloaded
              ? '已下载完成'
              : isDownloading
                ? `下载中 ${progress.toFixed(0)}%`
                : <>发现新版本 <span className="text-brand-600">v{version}</span></>}
        </span>

        {/* 按钮组 */}
        <div className="flex gap-1.5">
          {phase === 'available' && (
            <>
              <button
                onClick={onUpdate}
                className="whitespace-nowrap rounded-full bg-brand-500 px-3 py-1 text-[11px] font-medium text-white hover:bg-brand-600"
              >
                立即更新
              </button>
              <button
                onClick={onRemindLater}
                className="whitespace-nowrap rounded-full border border-black/10 px-3 py-1 text-[11px] text-gray-500 hover:bg-gray-50"
              >
                暂不更新
              </button>
            </>
          )}

          {isDownloading && (
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100 self-center">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-200"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
          )}

          {isDownloaded && (
            <button
              onClick={onInstall}
              className="whitespace-nowrap rounded-full bg-brand-500 px-3 py-1 text-[11px] font-medium text-white hover:bg-brand-600"
            >
              立即重启
            </button>
          )}

          {isError && (
            <>
              <button
                onClick={onUpdate}
                className="whitespace-nowrap rounded-full bg-brand-500 px-3 py-1 text-[11px] font-medium text-white hover:bg-brand-600"
              >
                重试
              </button>
              <button
                onClick={onRemindLater}
                className="whitespace-nowrap rounded-full border border-black/10 px-3 py-1 text-[11px] text-gray-500 hover:bg-gray-50"
              >
                稍后
              </button>
            </>
          )}
        </div>

        {/* 下载中：底部细进度条（不占额外高度） */}
        {isDownloading && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden rounded-b-lg bg-gray-100">
            <div
              className="h-full bg-brand-500 transition-all duration-200"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export { formatSpeed, formatSize }
