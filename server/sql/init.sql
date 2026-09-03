-- ============================================================
-- 绝色 · MySQL 建表脚本（与 server/src/db/schema.ts 保持同步）
-- 幂等可重复执行：CREATE TABLE IF NOT EXISTS，表已存在则跳过，不重建不清空
--
-- 用法：
--   mysql -u root -p < server/sql/init.sql
--   或在 MySQL 客户端中：  source server/sql/init.sql
--
-- 引擎：InnoDB（外键依赖 InnoDB）  字符集：utf8mb4（支持 emoji）
-- 布尔：TINYINT(1)，mysql2 驱动默认还原为 JS boolean
-- 时间：DATETIME + CURRENT_TIMESTAMP，updated_at 自动维护
-- ============================================================

CREATE DATABASE IF NOT EXISTS stunning_fast
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE stunning_fast;

-- ========== 迁移版本跟踪表（用于 sql/migrations/ 目录下的升级脚本） ==========
CREATE TABLE IF NOT EXISTS schema_migrations (
  version      VARCHAR(32)  NOT NULL,
  name         VARCHAR(128) NOT NULL,
  applied_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========== 系统配置表（全局共享，管理员维护） ==========

-- 供应商
CREATE TABLE IF NOT EXISTS providers (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 模型（外键引用 providers，级联删除）
CREATE TABLE IF NOT EXISTS models (
  id            VARCHAR(64)  NOT NULL,
  provider_id   VARCHAR(64)  NOT NULL,
  name          VARCHAR(128) NOT NULL,
  type          VARCHAR(32)  NOT NULL DEFAULT 'video',
  description   TEXT         NOT NULL,
  supports_i2v       TINYINT(1)   NOT NULL DEFAULT 0,
  supports_first_last TINYINT(1)   NOT NULL DEFAULT 0,
  supports_reference  TINYINT(1)   NOT NULL DEFAULT 0,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 功能入口
CREATE TABLE IF NOT EXISTS features (
  id          VARCHAR(64)  NOT NULL,
  name        VARCHAR(64)  NOT NULL,
  icon        VARCHAR(16)  NOT NULL DEFAULT '✨',
  description VARCHAR(256) NOT NULL DEFAULT '',
  pinned      TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order  INT          NOT NULL DEFAULT 0,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 视频生成参数选项（resolution / ratio / duration / priority）
CREATE TABLE IF NOT EXISTS video_config_options (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========== 用户表 ==========

CREATE TABLE IF NOT EXISTS users (
  id            INT          NOT NULL AUTO_INCREMENT,
  username      VARCHAR(64)  NOT NULL,
  password_hash VARCHAR(128) NOT NULL,
  role          VARCHAR(16)  NOT NULL DEFAULT 'user',
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========== 用户私有配置表（按 user_id 隔离） ==========

-- 用户自填 API 密钥（upsert：ON DUPLICATE KEY UPDATE）
CREATE TABLE IF NOT EXISTS user_api_keys (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 用户自定义配置（功能排序、面板尺寸、布局、透明度等）
CREATE TABLE IF NOT EXISTS user_configs (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========== 用户任务记录表（统计模型/服务商使用情况） ==========

-- 任务生成记录
CREATE TABLE IF NOT EXISTS tasks (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========== 用户意见反馈表（客户端提交，管理员查看处理） ==========
CREATE TABLE IF NOT EXISTS feedbacks (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  user_id       INT          NOT NULL,
  category      VARCHAR(32)  NOT NULL DEFAULT 'other',
  title         VARCHAR(128) NOT NULL DEFAULT '',
  content       TEXT         NOT NULL,
  contact       VARCHAR(128) NOT NULL DEFAULT '',
  status        VARCHAR(16)  NOT NULL DEFAULT 'open',
  admin_reply   TEXT         NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_feedbacks_user (user_id),
  INDEX idx_feedbacks_status (status),
  INDEX idx_feedbacks_created (created_at),
  CONSTRAINT fk_feedbacks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 说明：
--  1. 本脚本仅建表，不含种子数据。
--  2. 启动后端服务（npm run dev）时，seed.ts 会检测各表为空
--     时自动插入：9 家供应商 + 24 个模型、6 个功能入口、
--     15 项视频参数选项、1 个管理员账号（admin/admin123）。
--     表已有数据则跳过，不会覆盖管理员后续的修改。
--     tasks/feedbacks 表无种子数据，由客户端提交时写入。
--  3. 如需完全重置：DROP DATABASE stunning_fast; 后重新执行本脚本。
--  4. 建表依赖顺序：providers → models → users → user_api_keys/user_configs/tasks/feedbacks
--     （外键要求被引用表先存在，本脚本已按此顺序排列）。
--  5. 对于「老数据库 + 新增字段」的演进场景，请使用迁移脚本：
--       # 方式 A（推荐）：  npm run migrate           # 通过项目连接池自动执行 sql/migrations/
--       # 方式 B（手动）：  mysql -u root -p < server/sql/migrations/V001__*.sql
--     迁移脚本使用 schema_migrations 表记录已执行版本，重复执行安全。
-- ============================================================




