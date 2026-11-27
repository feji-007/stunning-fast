// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import LoginModal from './LoginModal'
import { useStore } from '../store/useStore'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  useStore.setState({ modal: 'login' })
})

afterEach(() => {
  cleanup()
})

describe('登录 / 注册面板稳定挂载', () => {
  it('切换 Tab 只隐藏面板：实例不销毁，各自输入内容保留且互不污染', () => {
    render(<LoginModal />)

    const loginPane = screen.getByTestId('login-pane')
    const registerPane = screen.getByTestId('register-pane')
    expect(loginPane.hidden).toBe(false)
    expect(registerPane.hidden).toBe(true)

    // 登录页输入账号密码
    const loginUsername = within(loginPane).getByPlaceholderText('请输入用户名') as HTMLInputElement
    const loginPassword = within(loginPane).getByPlaceholderText('请输入密码') as HTMLInputElement
    fireEvent.change(loginUsername, { target: { value: 'alice' } })
    fireEvent.change(loginPassword, { target: { value: 'Secret#123' } })

    // 切到注册页：登录面板被隐藏，但仍留在 DOM 中
    fireEvent.click(screen.getByTestId('tab-register'))
    expect(loginPane.hidden).toBe(true)
    expect(registerPane.hidden).toBe(false)
    expect(loginPane.isConnected).toBe(true)

    const registerUsername = within(registerPane).getByPlaceholderText('请输入用户名') as HTMLInputElement
    fireEvent.change(registerUsername, { target: { value: 'bobby' } })

    // 切回登录页：DOM 节点仍是同一个实例，原输入未丢失，也没有混入注册页内容
    fireEvent.click(screen.getByTestId('tab-login'))
    expect(loginPane.hidden).toBe(false)

    const loginUsernameAfter = within(loginPane).getByPlaceholderText('请输入用户名') as HTMLInputElement
    expect(loginUsernameAfter).toBe(loginUsername)
    expect(loginUsernameAfter.value).toBe('alice')
    expect((within(loginPane).getByPlaceholderText('请输入密码') as HTMLInputElement).value).toBe('Secret#123')

    // 注册页同样保留自己的输入，且未与登录页串用
    expect(registerUsername.isConnected).toBe(true)
    expect(registerUsername.value).toBe('bobby')
    expect(registerUsername).not.toBe(loginUsername)
  })

  it('登录方式（账号密码 / 邮箱验证码）切换不销毁面板，已输入内容保留', () => {
    render(<LoginModal />)
    const loginPane = screen.getByTestId('login-pane')

    fireEvent.change(within(loginPane).getByPlaceholderText('请输入用户名'), {
      target: { value: 'alice' }
    })
    fireEvent.change(within(loginPane).getByPlaceholderText('请输入密码'), {
      target: { value: 'Secret#123' }
    })

    fireEvent.click(within(loginPane).getByText('使用邮箱验证码登录'))
    expect(within(loginPane).getByPlaceholderText('用于接收验证码')).toBeTruthy()

    fireEvent.click(within(loginPane).getByText('使用账号密码登录'))
    expect((within(loginPane).getByPlaceholderText('请输入用户名') as HTMLInputElement).value).toBe('alice')
    expect((within(loginPane).getByPlaceholderText('请输入密码') as HTMLInputElement).value).toBe('Secret#123')
  })
})
