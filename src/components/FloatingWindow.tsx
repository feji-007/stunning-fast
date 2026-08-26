import { useEffect } from 'react'
import { useStore } from '../store/useStore'

// 悬浮球：手动区分拖拽与点击
// - 按住并移动 > 5px → 拖动窗口
// - 按下不移动即松开 → 展开面板
export default function FloatingWindow() {
  const setModal = useStore((s) => s.setModal)
  const user = useStore((s) => s.user)
  const restoreFromCollapse = useStore((s) => s.restoreFromCollapse)

  useEffect(() => {
    const off = window.api?.onContextMenuSettings?.(() => {
      setModal(user.loggedIn ? 'settings' : 'login')
    })
    return () => off?.()
  }, [setModal, user.loggedIn])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    window.api?.showContextMenu?.({ username: user.username, loggedIn: user.loggedIn })
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return // 仅左键

    // 同步计算窗口当前位置：screenX - clientX = 窗口左上角 X
    const state = {
      startMX: e.screenX,
      startMY: e.screenY,
      winX: e.screenX - e.clientX,
      winY: e.screenY - e.clientY,
      dragging: false,
      curX: e.screenX - e.clientX,
      curY: e.screenY - e.clientY
    }

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.screenX - state.startMX
      const dy = ev.screenY - state.startMY
      if (!state.dragging && Math.hypot(dx, dy) > 5) {
        state.dragging = true
      }
      if (state.dragging) {
        state.curX = state.winX + dx
        state.curY = state.winY + dy
        window.api?.moveWindow?.(state.curX, state.curY)
      }
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      if (state.dragging) {
        // 拖拽结束，保存位置
        window.api?.savePosition?.(state.curX, state.curY)
      } else {
        // 点击：展开面板
        restoreFromCollapse()
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div
      className="flex h-screen w-screen items-center justify-center"
      onContextMenu={handleContextMenu}
    >
      <button
        className="group relative h-16 w-16 cursor-grab rounded-full bg-brand-400 transition-transform hover:scale-105 active:cursor-grabbing"
        title="绝色 · 点击展开 · 拖拽移动 · 右键菜单"
        onMouseDown={handleMouseDown}
      >
        <span className="pointer-events-none flex h-10 w-10 items-center justify-center rounded-full text-2xl text-[#3A2E1F] m-auto">
          ⚡
        </span>
        <span className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/70 px-2 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
          点击展开 · 拖拽移动 · 右键菜单
        </span>
      </button>
    </div>
  )
}
