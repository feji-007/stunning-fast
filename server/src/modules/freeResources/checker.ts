import { query } from '../../db/pool'

/** 单个 URL 校验结果 */
export interface CheckResult {
  status: 'normal' | 'restricted' | 'invalid'
  failReason: string
}

/** HTTP HEAD 超时 */
const HTTP_TIMEOUT_MS = 8000
/** 单轮批量处理上限（避免一口气拉死） */
const BATCH_SIZE = 20
/** 正常/受限资源校验周期 24h */
const NORMAL_INTERVAL_MS = 24 * 60 * 60 * 1000
/** invalid 状态重试周期 6h（尽快恢复） */
const INVALID_RETRY_MS = 6 * 60 * 60 * 1000
/** 调度器主循环 24h */
const SCHEDULE_INTERVAL_MS = 24 * 60 * 60 * 1000
/** 启动后首次执行延迟（等 schema/seed 就绪） */
const INITIAL_DELAY_MS = 30_000

/**
 * 对单个 URL 发起 HTTP HEAD 校验。
 * - 2xx/3xx → normal
 * - 4xx → restricted（可能是 403/地区限制/需要登录）
 * - 5xx / 超时 / DNS 解析失败 → invalid
 */
export async function checkSingleUrl(url: string): Promise<CheckResult> {
  let status: CheckResult['status'] = 'normal'
  let failReason = ''
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS)
    const resp = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      signal: ctrl.signal
    })
    clearTimeout(timer)
    if (resp.status >= 200 && resp.status < 400) {
      status = 'normal'
    } else if (resp.status >= 400 && resp.status < 500) {
      status = 'restricted'
      failReason = `HTTP ${resp.status}`
    } else {
      status = 'invalid'
      failReason = `HTTP ${resp.status}`
    }
  } catch (e: any) {
    status = 'invalid'
    failReason = e?.name === 'AbortError' ? `超时（${HTTP_TIMEOUT_MS / 1000}s）` : (e?.message ?? '连接失败')
  }
  return { status, failReason }
}

/** 模块级定时器引用 —— 单例锁，防 nodemon 热重载多实例并存 */
let timerId: NodeJS.Timeout | null = null
/** 单轮执行中标记 —— setInterval 触发时若上一轮还在跑则跳过 */
let running = false

const LOG = (...args: any[]) => console.log('[cron:fr-check]', ...args)

/**
 * 筛选需要本轮校验的资源。
 * 规则：
 *   invalid     → 距上次校验 > 6h（尽快恢复）
 *   restricted  → 距上次校验 > 24h
 *   normal      → 从未校验 或 距上次校验 > 24h
 */
async function pickDueResources(): Promise<any[]> {
  const rows = await query(
    `SELECT id, url, status, last_check_at
     FROM free_resources
     WHERE is_active = TRUE AND url <> ''`
  )
  const now = Date.now()
  const picks: any[] = []
  for (const r of rows.rows as any[]) {
    const last = r.last_check_at ? new Date(r.last_check_at).getTime() : null
    let due = false
    if (r.status === 'invalid') {
      due = last == null || (now - last) > INVALID_RETRY_MS
    } else if (r.status === 'restricted') {
      due = last == null || (now - last) > NORMAL_INTERVAL_MS
    } else {
      // normal 或新建的
      due = last == null || (now - last) > NORMAL_INTERVAL_MS
    }
    if (due) picks.push(r)
    if (picks.length >= BATCH_SIZE) break
  }
  return picks
}

/** 单轮批量执行 */
export async function runOnce(): Promise<void> {
  if (running) {
    LOG('上一轮仍在执行，跳过本次触发')
    return
  }
  running = true
  const startedAt = Date.now()
  let total = 0
  let changed = 0
  try {
    const picks = await pickDueResources()
    if (picks.length === 0) {
      LOG('本轮无到期资源，跳过')
      return
    }
    LOG(`本轮计划校验 ${picks.length} 个资源`)
    for (const r of picks) {
      total++
      const before = r.status
      const { status, failReason } = await checkSingleUrl(r.url)
      if (status !== before || failReason !== '') changed++
      await query(
        `UPDATE free_resources
           SET status = ?, last_check_at = NOW(),
               check_count = check_count + 1, fail_reason = ?
         WHERE id = ?`,
        [status, failReason, r.id]
      )
      LOG(`  ${r.id.padEnd(24)} ${before} → ${status}${failReason ? ` (${failReason})` : ''}`)
    }
  } catch (e: any) {
    LOG('单轮执行异常：', e?.message ?? e)
  } finally {
    const cost = ((Date.now() - startedAt) / 1000).toFixed(1)
    LOG(`本轮完成：校验 ${total} 个，状态变化 ${changed} 个，耗时 ${cost}s`)
    running = false
  }
}

/** 启动调度器（幂等 —— 已启动则先 stop 再 start） */
export function startFrChecker(): void {
  stopFrChecker()
  LOG(`调度器启动：周期 ${SCHEDULE_INTERVAL_MS / 3600000}h，首次延迟 ${INITIAL_DELAY_MS / 1000}s 执行`)
  // 首次延迟执行（等 schema/seed 就绪）
  const bootTimer = setTimeout(() => {
    void runOnce()
  }, INITIAL_DELAY_MS)
  // 周期调度
  timerId = setInterval(() => {
    void runOnce()
  }, SCHEDULE_INTERVAL_MS) as unknown as NodeJS.Timeout
  // 首次延迟也纳入管理（进程退出时清理）
  ;(timerId as any)._boot = bootTimer
}

/** 停止调度器（graceful shutdown 用） */
export function stopFrChecker(): void {
  if (timerId) {
    clearInterval(timerId)
    const boot = (timerId as any)._boot as NodeJS.Timeout | undefined
    if (boot) clearTimeout(boot)
    timerId = null
    LOG('调度器已停止')
  }
}
