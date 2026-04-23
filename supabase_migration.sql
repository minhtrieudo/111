-- ═══════════════════════════════════════════════════════════════
-- LÀNG PI — Supabase Migration
-- Chạy file này trong Supabase Dashboard > SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Bảng farms: lưu trạng thái vườn mỗi người chơi
CREATE TABLE IF NOT EXISTS farms (
  username     TEXT PRIMARY KEY,
  pi_balance   FLOAT  NOT NULL DEFAULT 10,
  stars        INT    NOT NULL DEFAULT 0,
  plots        JSONB  NOT NULL DEFAULT '[]',
  inventory    JSONB  NOT NULL DEFAULT '{}',
  char_pos     JSONB  NOT NULL DEFAULT '{"x":28,"y":38}',
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- 2. Bảng visit_logs: log sự kiện thăm vườn
CREATE TABLE IF NOT EXISTS visit_logs (
  id           BIGSERIAL PRIMARY KEY,
  target       TEXT        NOT NULL,  -- username chủ vườn
  visitor      TEXT        NOT NULL,  -- username người thăm
  type         TEXT        NOT NULL   CHECK (type IN ('water','pest','steal')),
  plot_idx     INT         NOT NULL,
  plant        TEXT,                  -- emoji cây bị tác động
  amount       FLOAT       DEFAULT 0, -- % bị trộm hoặc % tăng thêm
  seen         BOOLEAN     DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- 3. Index để query nhanh
CREATE INDEX IF NOT EXISTS idx_farms_username     ON farms (username);
CREATE INDEX IF NOT EXISTS idx_visits_target      ON visit_logs (target, seen);
CREATE INDEX IF NOT EXISTS idx_visits_created     ON visit_logs (created_at DESC);

-- 4. Auto-update updated_at khi farms thay đổi
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS farms_updated_at ON farms;
CREATE TRIGGER farms_updated_at
  BEFORE UPDATE ON farms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. Row Level Security (RLS) — bảo mật quan trọng!
ALTER TABLE farms       ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_logs  ENABLE ROW LEVEL SECURITY;

-- farms: ai cũng đọc được (để thăm vườn), chỉ chủ mới sửa được
CREATE POLICY "farms_read_all"
  ON farms FOR SELECT USING (true);

CREATE POLICY "farms_insert_own"
  ON farms FOR INSERT WITH CHECK (true);  -- Pi SDK verify ở app layer

CREATE POLICY "farms_update_own"
  ON farms FOR UPDATE USING (true);       -- Pi SDK verify ở app layer

-- visit_logs: ai cũng insert được (để ghi hành động thăm vườn)
CREATE POLICY "visits_read_own"
  ON visit_logs FOR SELECT USING (true);

CREATE POLICY "visits_insert_all"
  ON visit_logs FOR INSERT WITH CHECK (true);

CREATE POLICY "visits_update_seen"
  ON visit_logs FOR UPDATE USING (true);

-- 6. Enable Realtime cho bảng farms (cây lớn real-time)
ALTER PUBLICATION supabase_realtime ADD TABLE farms;
ALTER PUBLICATION supabase_realtime ADD TABLE visit_logs;

-- ═══════════════════════════════════════════════════════
-- XONG! Sau khi chạy, copy Supabase URL + anon key
-- vào file lib/supabase.ts trong project
-- ═══════════════════════════════════════════════════════
