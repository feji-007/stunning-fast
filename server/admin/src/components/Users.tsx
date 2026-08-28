// 用户管理:列表/新增/启用禁用/重置密码/删除/分页;当前登录管理员不可删除/禁用自己。
import { useEffect, useState } from 'react'
import { usersApi, getStoredUser } from '../api'
import Pagination from './Pagination'

interface User {
  id: number
  username: string
  role: 'admin' | 'user'
  is_active: boolean
  created_at: string
}

interface Form {
  username: string
  password: string
  role: 'admin' | 'user'
  is_active: boolean
}

const EMPTY_FORM: Form = { username: '', password: '', role: 'user', is_active: true }

export default function Users() {
  const [list, setList] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<null | { mode: 'create' | 'edit'; data: Form; id?: number }>(null)
  const [resetModal, setResetModal] = useState<null | { id: number; username: string; password: string }>(null)
  const [saving, setSaving] = useState(false)
  // 分页
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  const me = getStoredUser()

  const load = (targetPage = page, targetSize: number = pageSize) => {
    setLoading(true); setError('')
    usersApi.list({ page: targetPage, pageSize: targetSize })
      .then((r) => {
        setList(r.users ?? [])
        setTotal(r.total ?? (r.users?.length ?? 0))
        setPage(r.page ?? targetPage)
        setPageSize(r.pageSize ?? targetSize)
        setTotalPages(r.totalPages ?? Math.max(1, Math.ceil((r.total ?? 0) / targetSize)))
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(1, pageSize) }, [])

  const toggleActive = (u: User) => {
    usersApi.update(u.id, { isActive: !u.is_active })
      .then(() => load(page, pageSize)).catch((e: Error) => alert(e.message))
  }

  const remove = (u: User) => {
    if (me && me.id === u.id) { alert('不能删除当前登录的管理员账号'); return }
    if (!confirm(`确认删除用户「${u.username}」?`)) return
    usersApi.remove(u.id)
      .then(() => load(page === 1 ? 1 : (list.length === 1 ? Math.max(1, page - 1) : page), pageSize))
      .catch((e: Error) => alert(e.message))
  }

  const save = () => {
    if (!modal) return
    if (!modal.data.username.trim()) { alert('请填写用户名'); return }
    if (modal.mode === 'create' && !modal.data.password) { alert('请设置初始密码'); return }
    setSaving(true)
    const done = () => { setModal(null); load(page, pageSize) }
    const fail = (e: Error) => alert(e.message)
    const fin  = () => setSaving(false)
    if (modal.mode === 'create') {
      usersApi.create(modal.data).then(done).catch(fail).finally(fin)
    } else {
      const { password, ...rest } = modal.data
      const body: any = { ...rest }
      if (password) body.password = password
      usersApi.update(modal.id!, body).then(done).catch(fail).finally(fin)
    }
  }

  const doReset = () => {
    if (!resetModal) return
    if (!resetModal.password) { alert('请输入新密码'); return }
    setSaving(true)
    usersApi.resetPassword(resetModal.id, resetModal.password)
      .then(() => setResetModal(null))
      .catch((e: Error) => alert(e.message))
      .finally(() => setSaving(false))
  }

  const fmtDate = (s: string) => {
    if (!s) return '-'
    const d = new Date(s)
    if (isNaN(d.getTime())) return s
    return d.toLocaleString('zh-CN', { hour12: false })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">用户管理</h2>
        <button
          onClick={() => setModal({ mode: 'create', data: { ...EMPTY_FORM } })}
          className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm hover:bg-brand-700"
        >+ 新增用户</button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
      )}

      <div className="bg-white rounded-xl shadow-float overflow-hidden overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-400">加载中…</div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-gray-400">暂无数据</div>
        ) : (
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-200">
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">用户名</th>
                <th className="px-4 py-3 text-left">角色</th>
                <th className="px-4 py-3 text-left">状态</th>
                <th className="px-4 py-3 text-left">创建时间</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((u) => {
                const isSelf = me?.id === u.id
                return (
                  <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500">{u.id}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {u.username}
                      {isSelf && <span className="ml-2 text-xs text-brand-600">(我)</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${u.role === 'admin' ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-600'}`}>
                        {u.role === 'admin' ? '管理员' : '用户'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${u.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                        {u.is_active ? '启用' : '禁用'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{fmtDate(u.created_at)}</td>
                    <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => toggleActive(u)}
                        disabled={isSelf}
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 disabled:opacity-40"
                      >{u.is_active ? '禁用' : '启用'}</button>
                      <button
                        onClick={() => setResetModal({ id: u.id, username: u.username, password: '' })}
                        className="px-2 py-1 text-xs bg-amber-50 text-amber-700 rounded hover:bg-amber-100"
                      >重置密码</button>
                      <button
                        onClick={() => setModal({
                          mode: 'edit', id: u.id,
                          data: { username: u.username, password: '', role: u.role, is_active: u.is_active }
                        })}
                        className="px-2 py-1 text-xs bg-brand-50 text-brand-700 rounded hover:bg-brand-100"
                      >编辑</button>
                      <button
                        onClick={() => remove(u)}
                        disabled={isSelf}
                        className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 disabled:opacity-40"
                      >删除</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <Pagination
          page={page} pageSize={pageSize} total={total} totalPages={totalPages}
          onChange={({ page: np, pageSize: ns }) => {
            if (ns !== pageSize) { setPageSize(ns); setPage(1); load(1, ns) }
            else { setPage(np); load(np, ns) }
          }}
        />
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-float w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-800 mb-4">
              {modal.mode === 'create' ? '新增用户' : '编辑用户'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">用户名</label>
                <input
                  value={modal.data.username}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, username: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  密码 {modal.mode === 'edit' && '（留空不修改）'}
                </label>
                <input
                  type="password"
                  value={modal.data.password}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, password: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="至少 4 位"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">角色</label>
                  <select
                    value={modal.data.role}
                    onChange={(e) => setModal({ ...modal, data: { ...modal.data, role: e.target.value as 'admin' | 'user' } })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="user">用户</option>
                    <option value="admin">管理员</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">状态</label>
                  <select
                    value={modal.data.is_active ? '1' : '0'}
                    onChange={(e) => setModal({ ...modal, data: { ...modal.data, is_active: e.target.value === '1' } })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="1">启用</option>
                    <option value="0">禁用</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
              >取消</button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60"
              >{saving ? '保存中…' : '确认'}</button>
            </div>
          </div>
        </div>
      )}

      {resetModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-float w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-800 mb-4">重置密码 · {resetModal.username}</h3>
            <div>
              <label className="block text-sm text-gray-700 mb-1">新密码</label>
              <input
                type="password"
                value={resetModal.password}
                onChange={(e) => setResetModal({ ...resetModal, password: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="至少 4 位"
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setResetModal(null)}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
              >取消</button>
              <button
                onClick={doReset}
                disabled={saving}
                className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60"
              >{saving ? '保存中…' : '确认'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

