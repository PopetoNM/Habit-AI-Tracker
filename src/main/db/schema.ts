export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  alias TEXT,
  age INTEGER,
  location TEXT,
  timezone TEXT DEFAULT 'UTC',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_sources (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  title TEXT NOT NULL,
  raw_content TEXT NOT NULL,
  structured_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  why TEXT,
  target_value TEXT,
  target_date TEXT,
  priority INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  priority INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT,
  category TEXT,
  target_type TEXT NOT NULL,
  target_value REAL,
  minimum_value REAL,
  unit TEXT,
  sort_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habit_checkins (
  id TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  value REAL,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(habit_id, date)
);

CREATE TABLE IF NOT EXISTS daily_scores (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  mood_score INTEGER,
  motivation_score INTEGER,
  energy_score INTEGER,
  focus_score INTEGER,
  stress_score INTEGER,
  sleep_hours REAL,
  journal_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  project_id TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  estimated_minutes INTEGER,
  scheduled_block_id TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS planner_settings (
  id TEXT PRIMARY KEY,
  visible_start_time TEXT DEFAULT '05:00',
  visible_end_time TEXT DEFAULT '21:00',
  slot_minutes INTEGER DEFAULT 15,
  first_day_of_week INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS time_blocks (
  id TEXT PRIMARY KEY,
  week_start_date TEXT NOT NULL,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  project_id TEXT,
  habit_id TEXT,
  todo_id TEXT,
  is_locked INTEGER DEFAULT 0,
  is_recurring INTEGER DEFAULT 0,
  recurrence_rule TEXT,
  status TEXT DEFAULT 'planned',
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS planner_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  template_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  context_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coach_memories (
  id TEXT PRIMARY KEY,
  memory_type TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT,
  importance INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY,
  profile_id TEXT,
  theme TEXT DEFAULT 'spreadsheet',
  timezone TEXT DEFAULT 'UTC',
  first_day_of_week INTEGER DEFAULT 1,
  default_dashboard_page TEXT DEFAULT 'dashboard',
  backup_folder_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_settings (
  id TEXT PRIMARY KEY,
  default_model TEXT NOT NULL DEFAULT 'qwen3.5:9b-mlx',
  deep_review_model TEXT DEFAULT 'qwen3.6:27b-mlx',
  fallback_model TEXT DEFAULT 'qwen3.5:4b-mlx',
  active_model TEXT NOT NULL DEFAULT 'qwen3.5:9b-mlx',
  ollama_base_url TEXT NOT NULL DEFAULT 'http://localhost:11434',
  stream_enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backups (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  kind TEXT NOT NULL,
  size_bytes INTEGER,
  app_version TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS focus_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  habit_id TEXT,
  todo_id TEXT,
  title TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  planned_minutes INTEGER,
  actual_minutes INTEGER,
  distractions_count INTEGER DEFAULT 0,
  output_produced TEXT,
  next_action TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS distraction_logs (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  social_media_minutes INTEGER DEFAULT 0,
  junk_food INTEGER DEFAULT 0,
  main_distraction TEXT,
  trigger TEXT,
  fix_for_tomorrow TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id TEXT PRIMARY KEY,
  period_type TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  ai_summary TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_habit_checkins_date ON habit_checkins(date);
CREATE INDEX IF NOT EXISTS idx_habit_checkins_habit_date ON habit_checkins(habit_id, date);
CREATE INDEX IF NOT EXISTS idx_todos_date_status ON todos(date, status);
CREATE INDEX IF NOT EXISTS idx_time_blocks_week ON time_blocks(week_start_date);
CREATE INDEX IF NOT EXISTS idx_time_blocks_date ON time_blocks(date);
CREATE INDEX IF NOT EXISTS idx_daily_scores_date ON daily_scores(date);
`;
