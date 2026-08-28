/**
 * 数据库迁移执行器
 * ------------------------------------------------------------
 * - 读取 server/sql/migrations/V{NNN}__*.sql
 * - 按版本号 NNN 升序执行未执行过的版本
 * - 通过 schema_migrations(version) 记录已应用版本，保证幂等
 *
 * 用法：
 *   npm run migrate            # 执行所有未应用的迁移
 *   npm run migrate:status     # 查看迁移执行状态
 *   npm run migrate:pending    # 列出待执行的迁移
 *
 * 直接运行：
 *   npx tsx src/db/migrate.ts [pending|status]
 *
 * 设计说明：
 *  - 复用项目的数据库连接池（pool.ts），不依赖 mysql 客户端命令，
 *    容器/CI 环境也可直接运行。
 *  - 每个 SQL 文件作为一个事务提交（除非 SQL 内包含显式 DDL 提交）。
 *  - SQL 中的「;」作为语句分隔符；"PREPARE / EXECUTE / DEALLOCATE"
 *    等预处理语句会被当作单条语句整体执行（不按 ; 截断）。
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { config } from '../config'
import { pool, query, queryOne } from './pool'

// ---------- 基础结构 ----------

interface MigrationFile {
  version: string       // "001"
  order: number         // 1  （数字序号，排序用）
  name: string          // "add_source_to_providers_and_models"
  path: string          // 绝对路径
}

interface AppliedMigration {
  version: string
  name: string
  applied_at: Date | string
}

const MIGRATIONS_DIR = resolve(__dirname, '../../sql/migrations')

// ---------- 工具 ----------

/** 确保 schema_migrations 表存在 */
async function ensureMetaTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    VARCHAR(32)  NOT NULL,
      name       VARCHAR(128) NOT NULL,
      applied_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (version)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
}

/** 解析迁移目录：读取所有 V{NNN}__*.sql 文件 */
function loadMigrationFiles(): MigrationFile[] {
  const files: MigrationFile[] = []
  let entries: string[] = []
  try {
    entries = readdirSync(MIGRATIONS_DIR)
  } catch (e: any) {
    if (e?.code === 'ENOENT') {
      console.warn(`[migrate] 迁移目录不存在：${MIGRATIONS_DIR}，跳过。`)
      return files
    }
    throw e
  }
  for (const f of entries) {
    const m = /^V(\d+)__(.+)\.sql$/i.exec(f)
    if (!m) continue
    const order = Number(m[1])
    if (!Number.isFinite(order)) continue
    files.push({
      version: m[1].padStart(3, '0'),
      order,
      name: m[2].replace(/\.sql$/i, ''),
      path: join(MIGRATIONS_DIR, f)
    })
  }
  return files.sort((a, b) => a.order - b.order)
}

/** 取出已执行过的版本集合 */
async function loadApplied(): Promise<Map<string, AppliedMigration>> {
  const r = await query<AppliedMigration>(
    'SELECT version, name, applied_at FROM schema_migrations'
  )
  const map = new Map<string, AppliedMigration>()
  for (const row of r.rows) map.set(row.version, row)
  return map
}

/**
 * 拆分 SQL 文件为独立语句。
 *   - 按「;」拆分，但跳过 PREPARE / EXECUTE / DEALLOCATE 预处理块之间的分隔符。
 *   - 忽略纯注释行、空语句。
 */
function splitStatements(sql: string): string[] {
  // 去掉 -- 单行注释
  const cleaned = sql
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')
  const out: string[] = []
  // 预处理语句段：凡是碰到 PREPARE / EXECUTE / DEALLOCATE 行，
  // 整行作为单独语句提交，不再按 ; 拆分。
  const lines = cleaned.split(/\r?\n/)
  let buf: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const isPrepare = /^(PREPARE|EXECUTE|DEALLOCATE)\b/i.test(line)
    if (isPrepare) {
      if (buf.length) {
        pushPart(out, buf.join('\n'))
        buf = []
      }
      pushPart(out, line)
      continue
    }
    buf.push(raw)
    if (line.endsWith(';')) {
      pushPart(out, buf.join('\n'))
      buf = []
    }
  }
  if (buf.length) pushPart(out, buf.join('\n'))
  return out

  function pushPart(arr: string[], part: string) {
    const p = part.replace(/;+\s*$/s, '').trim()
    if (p) arr.push(p + ';')
  }
}

/** 执行单条迁移文件的全部 SQL，并写入版本记录 */
async function applyOne(m: MigrationFile): Promise<void> {
  const raw = readFileSync(m.path, 'utf8')
  const statements = splitStatements(raw)
  console.log(`[migrate] V${m.version} 共 ${statements.length} 条语句 -> ${m.name}`)
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    try {
      await query(stmt)
    } catch (e: any) {
      console.error(
        `[migrate] V${m.version} 语句 #${i + 1} 失败：\n  SQL : ${stmt.slice(0, 120)}\n  错误: ${e?.message ?? e}`
      )
      throw e
    }
  }
  await query(
    `INSERT IGNORE INTO schema_migrations (version, name) VALUES (?, ?)`,
    [m.version, m.name]
  )
  console.log(`[migrate] V${m.version} 已记录 ✓`)
}

// ---------- 子命令 ----------

async function cmdStatus() {
  await ensureMetaTable()
  const [files, applied] = await Promise.all([loadMigrationFiles(), loadApplied()])
  console.log(`\n  数据库：${config.databaseUrl.split('?')[0]}`)
  console.log(`  迁移目录：${MIGRATIONS_DIR}\n`)
  console.log('  Version   Status      名称')
  console.log('  -------   --------   ---------------------------------')
  for (const f of files) {
    const ok = applied.has(f.version)
    const row = applied.get(f.version)
    const when = ok && row && 'applied_at' in row
      ? `   [${String(row.applied_at).slice(0, 19)}]`
      : ''
    console.log(
      `  V${f.version}   ${ok ? 'APPLIED ✓' : 'PENDING  '}   ${f.name}${when}`
    )
  }
  console.log()
  console.log(`  共 ${files.length} 个迁移，已应用 ${applied.size} 个。`)
  console.log()
}

async function cmdPending() {
  await ensureMetaTable()
  const [files, applied] = await Promise.all([loadMigrationFiles(), loadApplied()])
  const pending = files.filter((f) => !applied.has(f.version))
  if (pending.length === 0) {
    console.log('[migrate] 没有待执行的迁移。')
    return
  }
  console.log(`[migrate] 待执行迁移（${pending.length}）：`)
  for (const f of pending) console.log(`  V${f.version}  ${f.name}  (${f.path})`)
}

async function cmdMigrate() {
  await ensureMetaTable()
  const [files, applied] = await Promise.all([loadMigrationFiles(), loadApplied()])
  const pending = files.filter((f) => !applied.has(f.version))
  if (pending.length === 0) {
    console.log('[migrate] 没有待执行的迁移，已是最新版本。')
    return
  }
  console.log(`[migrate] 将执行 ${pending.length} 个迁移：`)
  for (const f of pending) console.log(`  -> V${f.version}  ${f.name}`)
  for (const f of pending) {
    await applyOne(f)
  }
  console.log(`[migrate] 全部完成 ✓  已应用 ${pending.length} 个迁移。`)
}

// ---------- 入口 ----------

;(async () => {
  try {
    // 先验证数据库连接
    const ok = await (async () => {
      try {
        const r = await queryOne('SELECT 1 AS ok')
        return !!r
      } catch {
        return false
      }
    })()
    if (!ok) {
      console.error('[migrate] 无法连接数据库，请检查 .env 的 DATABASE_URL')
      process.exit(1)
    }
    const sub = process.argv[2]?.toLowerCase()
    if (sub === 'status') {
      await cmdStatus()
    } else if (sub === 'pending') {
      await cmdPending()
    } else {
      await cmdMigrate()
    }
  } catch (e) {
    console.error('[migrate] 执行失败：', e)
    process.exit(1)
  } finally {
    pool.end().catch(() => void 0)
  }
})()
