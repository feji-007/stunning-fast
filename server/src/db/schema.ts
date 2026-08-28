import { pool } from './pool'

/**
 * 建表脚本：全部使用 CREATE TABLE IF NOT EXISTS，幂等可重复执行。
 * 启动时逐条执行，表已存在则跳过，不会重建或清空已有数据。
 * MySQL 版本：DATETIME + AUTO_INCREMENT + TINYINT(1) 布尔 + InnoDB + utf8mb4。
 *
 * 注意：
 *  - TINYINT(1) 由 mysql2 自动还原为 JS boolean，业务层可沿用 true/false。
 *  - updated_at 使用 ON UPDATE CURRENT_TIMESTAMP 自动维护，显式赋值会覆盖。
 *  - 索引直接内联到 CREATE TABLE，避免 MySQL 不支持 CREATE INDEX IF NOT EXISTS。
 *  - 外键要求 InnoDB；表按依赖顺序声明，确保被引用表先存在。
 */
const SCHEMA_STATEMENTS: string[] = [
  // ========== 系统配置表（全局共享，管理员维护） ==========

  `CREATE TABLE IF NOT EXISTS providers (
  id          VARCHAR(64)  NOT NULL,
  name        VARCHAR(128) NOT NULL,
  key_hint    VARCHAR(64)  NOT NULL DEFAULT '',
  url         VARCHAR(256) NOT NULL DEFAULT '',
  source      VARCHAR(16)  NOT NULL DEFAULT 'system',
  sort_order  INT          NOT NULL DEFAULT 0,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS models (
  id            VARCHAR(64)  NOT NULL,
  provider_id   VARCHAR(64)  NOT NULL,
  name          VARCHAR(128) NOT NULL,
  type          VARCHAR(32)  NOT NULL DEFAULT 'video',
  description   TEXT         NOT NULL,
  supports_i2v       TINYINT(1)   NOT NULL DEFAULT 0,
  supports_first_last TINYINT(1)   NOT NULL DEFAULT 0,
  supports_reference TINYINT(1)   NOT NULL DEFAULT 0,
  resolution    INT          NOT NULL DEFAULT 720,
  speed         INT          NOT NULL DEFAULT 60,
  price         INT          NOT NULL DEFAULT 2,
  source        VARCHAR(16)  NOT NULL DEFAULT 'system',
  sort_order    INT          NOT NULL DEFAULT 0,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_models_provider (provider_id),
  INDEX idx_models_type (type),
  INDEX idx_models_source (source),
  CONSTRAINT fk_models_provider FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS features (
  id          VARCHAR(64)  NOT NULL,
  name        VARCHAR(64)  NOT NULL,
  icon        VARCHAR(16)  NOT NULL DEFAULT '\u{2728}',
  description VARCHAR(256) NOT NULL DEFAULT '',
  pinned      TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order  INT          NOT NULL DEFAULT 0,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS video_config_options (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  config_key    VARCHAR(64)  NOT NULL,
  option_value  VARCHAR(64)  NOT NULL,
  option_label  VARCHAR(128) NOT NULL,
  sort_order    INT          NOT NULL DEFAULT 0,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_vco_key_value (config_key, option_value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ========== 用户表 ==========

  `CREATE TABLE IF NOT EXISTS users (
  id            INT          NOT NULL AUTO_INCREMENT,
  username      VARCHAR(64)  NOT NULL,
  password_hash VARCHAR(128) NOT NULL,
  role          VARCHAR(16)  NOT NULL DEFAULT 'user',
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ========== 用户私有配置表（按 user_id 隔离） ==========

  `CREATE TABLE IF NOT EXISTS user_api_keys (
  id            INT          NOT NULL AUTO_INCREMENT,
  user_id       INT          NOT NULL,
  provider_id   VARCHAR(64) NOT NULL,
  encrypted_key TEXT         NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_uak_user_provider (user_id, provider_id),
  INDEX idx_uak_user (user_id),
  CONSTRAINT fk_uak_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS user_configs (
  id            INT          NOT NULL AUTO_INCREMENT,
  user_id       INT          NOT NULL,
  config_key    VARCHAR(128) NOT NULL,
  config_value  TEXT         NOT NULL,
  config_type   VARCHAR(16) NOT NULL DEFAULT 'string',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_uc_user_key (user_id, config_key),
  INDEX idx_uc_user (user_id),
  CONSTRAINT fk_uc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ========== 用户任务记录表（统计模型/服务商使用情况） ==========

  `CREATE TABLE IF NOT EXISTS tasks (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  user_id       INT          NOT NULL,
  provider_id   VARCHAR(64)  NOT NULL,
  model_id      VARCHAR(64)  NOT NULL,
  gen_mode      VARCHAR(8)   NOT NULL DEFAULT 't2v',
  status        VARCHAR(16)  NOT NULL DEFAULT 'success',
  resolution    VARCHAR(16)  NOT NULL DEFAULT '',
  ratio         VARCHAR(16)  NOT NULL DEFAULT '',
  duration      VARCHAR(16)  NOT NULL DEFAULT '',
  prompt        TEXT         NOT NULL,
  image_url     LONGTEXT      NULL,
  video_url     TEXT         NULL,
  error_message TEXT         NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_tasks_user (user_id),
  INDEX idx_tasks_provider (provider_id),
  INDEX idx_tasks_model (model_id),
  INDEX idx_tasks_status (status),
  INDEX idx_tasks_created (created_at),
  CONSTRAINT fk_tasks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
]

/**
 * 迁移：为已存在的表补充新字段（幂等，字段已存在则跳过）。
 * 用于在 CREATE TABLE IF NOT EXISTS 不重建表的情况下，为旧库补充新字段。
 */
async function addColumnIfMissing(table: string, column: string, definition: string) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  )
  if (Array.isArray(rows) && rows.length === 0) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`)
    console.log(`[db] 已为表 ${table} 添加字段 ${column}`)
  }
}

/** 启动时执行：创建所有表（幂等），并为已有表补充迁移字段。 */
export async function ensureSchema(): Promise<void> {
  for (const sql of SCHEMA_STATEMENTS) {
    await pool.query(sql)
  }
  // 迁移：为已有 providers/models 表补充 source 字段（区分系统自带 / 用户自定义）
  await addColumnIfMissing('providers', 'source', "VARCHAR(16) NOT NULL DEFAULT 'system'")
  await addColumnIfMissing('models', 'source', "VARCHAR(16) NOT NULL DEFAULT 'system'")
  await addColumnIfMissing('tasks', 'image_url', 'LONGTEXT NULL')
  await addColumnIfMissing('models', 'supports_first_last', 'TINYINT(1) NOT NULL DEFAULT 0')
  await addColumnIfMissing('models', 'supports_reference', 'TINYINT(1) NOT NULL DEFAULT 0')
  console.log('[db] 表结构检查完成（已存在则跳过）')
}



