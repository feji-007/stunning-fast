// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'

// 只保留真实的 LoginModal，其余重组件用轻量占位，聚焦「弹窗隐藏时实例不被销毁」
vi.mock('./components/MainPanel', () => ({ default: () => null }))
vi.mock('./components/FloatingWindow', () => ({ default: () => null }))
vi.mock('./components/SettingsModal', () => ({ default: () => <div data-testid="settings-modal" /> }))
vi.mock('./components/FeedbackModal', () => ({ default: () => <div data-testid="feedback-modal" /> }))
vi.mock('./components/StandaloneUpdateModal', () => ({ default: () => null }))
vi.mock('./components/RecommendationAssistantModal', () => ({ default: () => null }))

import App from './App'
import { useStore } from './store/useStore'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  useStore.setState({ modal: 'none', expanded: true })
})

afterEach(() => {
  cleanup()
})

describe('登录弹窗常驻挂载', () => {
  it('关闭弹窗或切到其它弹窗时不销毁实例，重新打开后已输入内容仍在', () => {
    act(() => useStore.setState({ modal: 'login' }))
    render(<App />)

    const loginPane = screen.getByTestId('login-pane')
    const username = within(loginPane).getByPlaceholderText('请输入用户名') as HTMLInputElement
    fireEvent.change(username, { target: { value: 'alice' } })

    // 弹窗关闭（用户关闭 / 自动收起等）：容器隐藏，但实例仍挂载
    act(() => useStore.getState().setModal('none'))
    expect(screen.getByTestId('login-pane')).toBe(loginPane)
    expect(loginPane.closest('[hidden]')).not.toBeNull()
    expect(username.value).toBe('alice')

    // 切到设置弹窗：登录实例依然保留
    act(() => useStore.getState().setModal('settings'))
    expect(screen.getByTestId('settings-modal')).toBeTruthy()
    expect(screen.getByTestId('login-pane')).toBe(loginPane)

    // 重新打开登录弹窗：同一实例，输入内容未丢失
    act(() => useStore.getState().setModal('login'))
    expect(loginPane.closest('[hidden]')).toBeNull()
    expect(screen.getByTestId('login-pane')).toBe(loginPane)
    expect((within(loginPane).getByPlaceholderText('请输入用户名') as HTMLInputElement).value).toBe('alice')
  })
})
