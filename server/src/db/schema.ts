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
  api_base_url VARCHAR(256) NOT NULL DEFAULT '',
  api_key_url VARCHAR(256) NOT NULL DEFAULT '',
  protocol    VARCHAR(32)  NOT NULL DEFAULT '',
  submit_path VARCHAR(256) NOT NULL DEFAULT '',
  status_path VARCHAR(256) NOT NULL DEFAULT '',
  submit_path_i2v VARCHAR(256) NOT NULL DEFAULT '',
  status_path_i2v VARCHAR(256) NOT NULL DEFAULT '',
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
  max_images    INT          NOT NULL DEFAULT 5,
  max_videos    INT          NOT NULL DEFAULT 0,
  max_audios    INT          NOT NULL DEFAULT 0,
  max_total_assets INT       NOT NULL DEFAULT 0,
  resolution    INT          NOT NULL DEFAULT 720,
  speed         INT          NOT NULL DEFAULT 60,
  price         INT          NOT NULL DEFAULT 2,
  default_resolution VARCHAR(16) NOT NULL DEFAULT '',
  default_ratio      VARCHAR(16) NOT NULL DEFAULT '',
  default_duration   VARCHAR(16) NOT NULL DEFAULT '',
  docs_url      VARCHAR(256) NOT NULL DEFAULT '',
  source        VARCHAR(16)  NOT NULL DEFAULT 'system',
  sort_order    INT          NOT NULL DEFAULT 0,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  -- ===== 步骤一新增：六层模型档案 =====
  scenarios     TEXT         NULL COMMENT '适用场景（JSON 数组，如 ["叙事","产品展示","角色一致性"]）',
  capabilities  TEXT         NULL COMMENT '能力边界说明（自由文本，描述擅长/不擅长什么）',
  limits_text   TEXT         NULL COMMENT '使用限制（自由文本，如"需要 24GB 显存"、"免费额度 20 条/天"）',
  verified_score INT         NOT NULL DEFAULT 0 COMMENT '实测评分 0-100，0 表示未实测',
  source_url    VARCHAR(512) NOT NULL DEFAULT '' COMMENT '内容来源 URL（官方文档/社区帖子等）',
  license       VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '授权类型（MIT/Apache/商用/免费额度/API 付费等）',
  commercial_allowed TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否允许商用',
  deployment    VARCHAR(32)  NOT NULL DEFAULT 'cloud' COMMENT '部署要求：cloud/local/hybrid',
  -- ===== 步骤一新增：三态审核 =====
  review_status VARCHAR(16)  NOT NULL DEFAULT 'published' COMMENT 'draft/review/published',
  reviewer_id   INT          NULL COMMENT '审核人 user_id',
  reviewed_at   DATETIME     NULL COMMENT '审核时间',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_models_provider (provider_id),
  INDEX idx_models_type (type),
  INDEX idx_models_source (source),
  INDEX idx_models_review (review_status),
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
  email         VARCHAR(128) NOT NULL DEFAULT '',
  role          VARCHAR(16)  NOT NULL DEFAULT 'user',
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ========== 邮箱验证码表（注册时校验邮箱归属） ==========

  `CREATE TABLE IF NOT EXISTS email_verify_codes (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  email      VARCHAR(128) NOT NULL,
  code       VARCHAR(8)   NOT NULL,
  expires_at DATETIME     NOT NULL,
  used       TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_evc_email (email),
  INDEX idx_evc_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ========== 系统参数表（管理员在后台维护，如 SMTP 邮件配置） ==========

  `CREATE TABLE IF NOT EXISTS system_configs (
  config_key   VARCHAR(64)  NOT NULL,
  config_value TEXT         NOT NULL,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (config_key)
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ========== 用户意见反馈表（客户端提交，管理员查看处理） ==========

  `CREATE TABLE IF NOT EXISTS feedbacks (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ========== 模型推荐助手配置表（管理员可编辑问答字段） ==========

  `CREATE TABLE IF NOT EXISTS recommend_models (
  id          VARCHAR(64)  NOT NULL,
  name        VARCHAR(128) NOT NULL,
  description TEXT         NOT NULL,
  tag         VARCHAR(128) NOT NULL DEFAULT '',
  sort_order  INT          NOT NULL DEFAULT 0,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS recommend_questions (
  id          INT          NOT NULL AUTO_INCREMENT,
  layer       VARCHAR(64)  NOT NULL,
  title       VARCHAR(256) NOT NULL,
  options     TEXT         NOT NULL,
  sort_order  INT          NOT NULL DEFAULT 0,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ========== AI 助手「使用指南」问答表（管理员可编辑） ==========

  `CREATE TABLE IF NOT EXISTS guide_questions (
  id          INT          NOT NULL AUTO_INCREMENT,
  category    VARCHAR(64)  NOT NULL DEFAULT '',
  question    VARCHAR(256) NOT NULL,
  answer      TEXT         NOT NULL,
  sort_order  INT          NOT NULL DEFAULT 0,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  // ========== AI 视频工具导购目录表（2026-11 新增） ==========

  `CREATE TABLE IF NOT EXISTS tools (
  id              VARCHAR(64)  NOT NULL,
  name            VARCHAR(128) NOT NULL,
  subtitle        VARCHAR(128) NOT NULL DEFAULT '',
  provider        VARCHAR(128) NOT NULL DEFAULT '',
  official_url    VARCHAR(256) NOT NULL DEFAULT '',
  api_docs_url    VARCHAR(256) NOT NULL DEFAULT '',
  api_key_url     VARCHAR(256) NOT NULL DEFAULT '',
  logo_url        VARCHAR(512) NOT NULL DEFAULT '',
  banner_url      VARCHAR(512) NOT NULL DEFAULT '',
  categories      VARCHAR(512) NOT NULL DEFAULT '',
  scenarios       VARCHAR(1024) NOT NULL DEFAULT '',
  difficulty      VARCHAR(16)  NOT NULL DEFAULT 'beginner',
  pricing_tier    VARCHAR(16)  NOT NULL DEFAULT 'free',
  starting_price  VARCHAR(64)  NOT NULL DEFAULT '',
  has_api         TINYINT(1)   NOT NULL DEFAULT 0,
  has_web_app     TINYINT(1)   NOT NULL DEFAULT 1,
  has_mobile_app  TINYINT(1)   NOT NULL DEFAULT 0,
  has_open_source TINYINT(1)   NOT NULL DEFAULT 0,
  synced_audio    TINYINT(1)   NOT NULL DEFAULT 0,
  max_resolution  VARCHAR(16)  NOT NULL DEFAULT '',
  max_clip_sec    INT          NOT NULL DEFAULT 0,
  supports_i2v    TINYINT(1)   NOT NULL DEFAULT 0,
  supports_t2v    TINYINT(1)   NOT NULL DEFAULT 1,
  supports_reference TINYINT(1) NOT NULL DEFAULT 0,
  short_desc      VARCHAR(256) NOT NULL DEFAULT '',
  highlights      TEXT         NOT NULL,
  limitations     TEXT         NOT NULL,
  setup_steps     TEXT         NOT NULL,
  notes           TEXT         NOT NULL,
  provider_id     VARCHAR(64)  NULL COMMENT '关联 providers.id：该工具对应的可调用供应商',
  model_ids       VARCHAR(512) NOT NULL DEFAULT '' COMMENT '可调用模型白名单（逗号分隔 models.id；留空=该供应商全部模型）',
  artificial_analysis_score INT NOT NULL DEFAULT 0,
  sort_order      INT          NOT NULL DEFAULT 0,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_tools_provider (provider_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS tool_favorites (
  user_id    INT          NOT NULL,
  tool_id    VARCHAR(64)  NOT NULL,
  note       VARCHAR(512) NOT NULL DEFAULT '',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, tool_id),
  CONSTRAINT fk_tf_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // 一次性数据迁移的执行标记（避免重复回填覆盖管理员修改）
  `CREATE TABLE IF NOT EXISTS meta (
  \`key\`     VARCHAR(64)  NOT NULL,
  \`value\`   VARCHAR(256) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`key\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // 步骤二：免费模型资源聚合表
  `CREATE TABLE IF NOT EXISTS free_resources (
  id            VARCHAR(64)  NOT NULL,
  title         VARCHAR(256) NOT NULL,
  category      VARCHAR(32)  NOT NULL COMMENT 'open_source / vendor_free_tier / local_deploy / online_trial / community',
  model_id      VARCHAR(64)  NULL COMMENT '关联到 models.id (可选)',
  tool_id       VARCHAR(64)  NULL COMMENT '关联到 tools.id (可选)',
  url           VARCHAR(512) NOT NULL COMMENT '资源访问地址',
  license       VARCHAR(64)  NOT NULL DEFAULT '',
  commercial_allowed TINYINT(1) NOT NULL DEFAULT 0,
  free_quota    VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '免费额度描述, 如 20条/天',
  entry_type    VARCHAR(32)  NOT NULL DEFAULT 'official' COMMENT 'official / community / mirror',
  region        VARCHAR(64)  NOT NULL DEFAULT '',
  notes         TEXT         NULL,
  source_url    VARCHAR(512) NOT NULL DEFAULT '',
  status        VARCHAR(16)  NOT NULL DEFAULT 'normal' COMMENT 'normal / restricted / invalid',
  last_check_at DATETIME     NULL,
  check_count   INT          NOT NULL DEFAULT 0,
  fail_reason   VARCHAR(256) NOT NULL DEFAULT '',
  sort_order    INT          NOT NULL DEFAULT 0,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_fr_model (model_id),
  INDEX idx_fr_category (category),
  INDEX idx_fr_status (status)
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
  // 迁移：为已有 providers/models 表补充 URL 字段（管理员可在后台覆盖默认跳转地址）
  await addColumnIfMissing('providers', 'api_key_url', "VARCHAR(256) NOT NULL DEFAULT ''")
  await addColumnIfMissing('models', 'docs_url', "VARCHAR(256) NOT NULL DEFAULT ''")
  // 迁移：为已有 users 表补充 email 字段（注册邮箱验证）
  await addColumnIfMissing('users', 'email', "VARCHAR(128) NOT NULL DEFAULT ''")
  // 迁移：为已有 providers 表补充 api_base_url 字段（管理员可在后台覆盖 API 调用端点）
  await addColumnIfMissing('providers', 'api_base_url', "VARCHAR(256) NOT NULL DEFAULT ''")
  // 迁移：为已有 providers 表补充视频生成协议与提交/查询路径（自定义供应商协议）
  await addColumnIfMissing('providers', 'protocol', "VARCHAR(32) NOT NULL DEFAULT ''")
  await addColumnIfMissing('providers', 'submit_path', "VARCHAR(256) NOT NULL DEFAULT ''")
  await addColumnIfMissing('providers', 'status_path', "VARCHAR(256) NOT NULL DEFAULT ''")
  // 迁移：图生视频可能使用独立端点（如可灵），由后台分别配置
  await addColumnIfMissing('providers', 'submit_path_i2v', "VARCHAR(256) NOT NULL DEFAULT ''")
  await addColumnIfMissing('providers', 'status_path_i2v', "VARCHAR(256) NOT NULL DEFAULT ''")
  // 迁移：模型级默认生成参数（选中模型时由客户端预填）
  await addColumnIfMissing('models', 'default_resolution', "VARCHAR(16) NOT NULL DEFAULT ''")
  await addColumnIfMissing('models', 'default_ratio', "VARCHAR(16) NOT NULL DEFAULT ''")
  await addColumnIfMissing('models', 'default_duration', "VARCHAR(16) NOT NULL DEFAULT ''")
  await addColumnIfMissing('models', 'max_images', 'INT NOT NULL DEFAULT 5')
  await addColumnIfMissing('models', 'max_videos', 'INT NOT NULL DEFAULT 0')
  await addColumnIfMissing('models', 'max_audios', 'INT NOT NULL DEFAULT 0')
  await addColumnIfMissing('models', 'max_total_assets', 'INT NOT NULL DEFAULT 0')
  // 步骤一迁移：六层模型档案字段
  await addColumnIfMissing('models', 'scenarios', 'TEXT NULL')
  await addColumnIfMissing('models', 'capabilities', 'TEXT NULL')
  await addColumnIfMissing('models', 'limits_text', 'TEXT NULL')
  await addColumnIfMissing('models', 'verified_score', 'INT NOT NULL DEFAULT 0')
  await addColumnIfMissing('models', 'source_url', "VARCHAR(512) NOT NULL DEFAULT ''")
  await addColumnIfMissing('models', 'license', "VARCHAR(64) NOT NULL DEFAULT ''")
  await addColumnIfMissing('models', 'commercial_allowed', 'TINYINT(1) NOT NULL DEFAULT 0')
  await addColumnIfMissing('models', 'deployment', "VARCHAR(32) NOT NULL DEFAULT 'cloud'")
  // 步骤一迁移：三态审核字段
  await addColumnIfMissing('models', 'review_status', "VARCHAR(16) NOT NULL DEFAULT 'published'")
  await addColumnIfMissing('models', 'reviewer_id', 'INT NULL')
  await addColumnIfMissing('models', 'reviewed_at', 'DATETIME NULL')
  // 统一管理：工具导购 ↔ 供应商 ↔ 模型 / 免费资源 关联
  await addColumnIfMissing('tools', 'provider_id', 'VARCHAR(64) NULL')
  await addColumnIfMissing('tools', 'model_ids', "VARCHAR(512) NOT NULL DEFAULT ''")
  await addColumnIfMissing('free_resources', 'tool_id', 'VARCHAR(64) NULL')
  console.log('[db] 表结构检查完成（已存在则跳过）')
}



