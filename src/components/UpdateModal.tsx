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

  return (
    <div className="flex h-full w-full items-center justify-center bg-black/30">
      <div className="w-80 rounded-2xl bg-white p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-xl">
            {isError ? '⚠️' : '🚀'}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-800">
              {isError ? '更新失败' : '发现新版本'}
            </h2>
            <p className="text-[11px] text-gray-400">
              v{currentVersion ?? '...'} → <span className="text-brand-600 font-medium">v{version}</span>
            </p>
          </div>
        </div>

        {/* 阶段一：待确认更新 */}
        {phase === 'available' && (
          <>
            <p className="mb-2 text-xs leading-relaxed text-gray-600">
              有新版本可用，建议更新以获得最新功能和修复。更新过程中请勿关闭应用。
            </p>
            {releaseNotes && (
              <div className="mb-3 max-h-24 overflow-auto rounded-lg bg-gray-50 p-2 text-[11px] leading-relaxed text-gray-500 scroll-thin">
                {releaseNotes}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={onRemindLater}
                className="flex-1 rounded-lg border border-black/10 py-2 text-xs text-gray-500 hover:bg-gray-50"
              >
                稍后提醒
              </button>
              <button
                onClick={onUpdate}
                className="flex-1 rounded-lg bg-brand-500 py-2 text-xs font-medium text-white hover:bg-brand-600"
              >
                立即更新
              </button>
            </div>
          </>
        )}

        {/* 阶段二：下载中 */}
        {isDownloading && (
          <>
            <div className="mb-2 flex items-center justify-between text-[11px] text-gray-500">
              <span>正在下载更新包…</span>
              <span className="font-mono text-brand-600">{progress.toFixed(1)}%</span>
            </div>
            <div className="mb-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-200"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            <p className="mt-3 text-center text-[10px] text-gray-400">
              下载过程中请勿关闭应用，完成后将提示重启安装
            </p>
          </>
        )}

        {/* 阶段三：下载完成，等待重启安装 */}
        {isDownloaded && (
          <>
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2">
              <span className="text-green-500">✓</span>
              <span className="text-[11px] text-green-700">更新包已下载完成</span>
            </div>
            <p className="mb-4 text-xs leading-relaxed text-gray-600">
              点击下方按钮将退出应用并自动安装新版本，安装完成后应用会自动重启。
            </p>
            <button
              onClick={onInstall}
              className="w-full rounded-lg bg-brand-500 py-2 text-xs font-medium text-white hover:bg-brand-600"
            >
              立即重启并安装
            </button>
          </>
        )}

        {/* 阶段四：更新出错 */}
        {isError && (
          <>
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2">
              <span className="text-red-500">✕</span>
              <span className="text-[11px] text-red-700">{errorMsg || '更新下载失败'}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onRemindLater}
                className="flex-1 rounded-lg border border-black/10 py-2 text-xs text-gray-500 hover:bg-gray-50"
              >
                稍后再试
              </button>
              <button
                onClick={onUpdate}
                className="flex-1 rounded-lg bg-brand-500 py-2 text-xs font-medium text-white hover:bg-brand-600"
              >
                重试
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export { formatSpeed, formatSize }
