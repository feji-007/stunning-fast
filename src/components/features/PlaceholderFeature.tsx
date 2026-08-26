import { useStore } from '../../store/useStore'
import type { FeatureId } from '../../types'

// 占位功能页：图像生成 / 语音合成 / AI 对话（接入待扩展）。
export default function PlaceholderFeature({ id }: { id: FeatureId }) {
  const titles: Record<string, string> = {
    image: '图像生成',
    audio: '语音合成',
    chat: 'AI 对话'
  }
  const user = useStore((s) => s.user)
  const setModal = useStore((s) => s.setModal)

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <span className="text-3xl">🚧</span>
      <p className="text-sm font-medium text-gray-700">{titles[id] ?? '功能'}</p>
      <p className="text-xs text-gray-400">
        该功能入口已就绪，前往
        <button
          className="mx-1 underline"
          onClick={() => setModal(user.loggedIn ? 'settings' : 'login')}
        >
          设置
        </button>
        配置对应供应商密钥后即可启用。
      </p>
    </div>
  )
}
