import mysql, { type Pool, type PoolConnection } from 'mysql2/promise'
import { config } from '../config'

// 单例连接池：整个服务共享一个池，避免每次请求新建连接。
// 通过 DATABASE_URL 解析连接参数（mysql://user:pass@host:port/db）。
export const pool: Pool = mysql.createPool(config.databaseUrl)

pool.on('connection', () => {
  // 连接被获取时触发，留空即可
})

// 统一查询返回结构：兼容原 pg 代码对 rows / rowCount 的引用，
// 同时暴露 insertId / affectedRows 供 MySQL 的 INSERT/UPDATE 使用。
// 泛型 T 代表「行数组」类型（rows 的类型）。
export interface QueryResult<T = Record<string, any>[]> {
  rows: T
  rowCount: number
  insertId?: number
  affectedRows?: number
}

/** 执行查询，返回包装后的结果。泛型 R 为单行类型，rows 类型为 R[]。 */
export async function query<R = Record<string, any>>(
  sql: string,
  params?: ReadonlyArray<unknown>
): Promise<QueryResult<R[]>> {
  const [result] = await pool.query(sql, params as unknown[])
  if (Array.isArray(result)) {
    // SELECT：result 即行数组
    return { rows: result as R[], rowCount: (result as unknown[]).length }
  }
  // INSERT / UPDATE / DELETE：result 为 ResultSetHeader
  const r = result as { affectedRows?: number; insertId?: number }
  return {
    rows: [] as unknown as R[],
    rowCount: r.affectedRows ?? 0,
    insertId: r.insertId,
    affectedRows: r.affectedRows
  }
}

/** 取一行：返回首行或 null。泛型 R 为单行类型。 */
export async function queryOne<R = Record<string, any>>(
  sql: string,
  params?: ReadonlyArray<unknown>
): Promise<R | null> {
  const { rows } = await query<R>(sql, params)
  return (rows[0] as R) ?? null
}

/** 在事务中执行多个操作。回调接收原生 PoolConnection，可调用 conn.query。 */
export async function withTransaction<T>(
  fn: (client: PoolConnection) => Promise<T>
): Promise<T> {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const result = await fn(conn)
    await conn.commit()
    return result
  } catch (err) {
    await conn.rollback().catch(() => {})
    throw err
  } finally {
    conn.release()
  }
}

/** 健康检查：能否正常连接数据库。 */
export async function pingDb(): Promise<boolean> {
  try {
    const [rows] = await pool.query('SELECT 1 AS v')
    return Array.isArray(rows) && rows.length > 0
  } catch {
    return false
  }
}