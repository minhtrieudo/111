-- ═══════════════════════════════════════════════════════════════
-- LÀNG PI — Reset Database v2
-- Thay đổi: dùng pi_uid làm primary key thay vì username
-- ═══════════════════════════════════════════════════════════════

-- Xóa sạch cũ
DROP TABLE IF EXISTS visit_logs CASCADE;
DROP TABLE IF EXISTS farms CASCADE;
DROP FUNCTION IF EXISTS update_updated_at CASCADE;

-- 1. Bảng farms — dùng pi_uid làm key chính
CREATE TABLE farms (
  pi_uid       TEXT PRIMARY KEY,         -- ID duy nhất từ Pi Network (không đổi)
  username     TEXT NOT NULL,            -- Tên hiển thị (có thể thay đổi)
  pi_balance   FLOAT       NOT NULL DEFAULT 10,
  stars        INT         NOT NULL DEFAULT 0,
  plots        JSONB       NOT NULL DEFAULT '[]',
  inventory    JSONB       NOT NULL DEFAULT '{}',
  char_pos     JSONB       NOT NULL DEFAULT '{"x":28,"y":38}',
  updated_at   TIMESTAMPTZ          DEFAULT now()
);

-- 2. Bảng visit_logs
CREATE TABLE visit_logs (
  id           BIGSERIAL PRIMARY KEY,
  target_uid   TEXT        NOT NULL,     -- pi_uid chủ vườn
  visitor_uid  TEXT        NOT NULL,     -- pi_uid người thăm
  visitor_name TEXT        NOT NULL,     -- username người thăm (để hiển thị)
  type         TEXT        NOT NULL CHECK (type IN ('water','pest','steal')),
  plot_idx     INT         NOT NULL,
  plant        TEXT,
  amount       FLOAT                DEFAULT 0,
  seen         BOOLEAN              DEFAULT false,
  created_at   TIMESTAMPTZ          DEFAULT now()
);

-- 3. Index
CREATE INDEX idx_farms_pi_uid     ON farms (pi_uid);
CREATE INDEX idx_farms_username   ON farms (username);
CREATE INDEX idx_visits_target    ON visit_logs (target_uid, seen);
CREATE INDEX idx_visits_created   ON visit_logs (created_at DESC);

-- 4. Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER farms_updated_at
  BEFORE UPDATE ON farms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. RLS
ALTER TABLE farms      ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farms_select"  ON farms      FOR SELECT USING (true);
CREATE POLICY "farms_insert"  ON farms      FOR INSERT WITH CHECK (true);
CREATE POLICY "farms_update"  ON farms      FOR UPDATE USING (true);

CREATE POLICY "visits_select" ON visit_logs FOR SELECT USING (true);
CREATE POLICY "visits_insert" ON visit_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "visits_update" ON visit_logs FOR UPDATE USING (true);

-- 6. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE farms;
ALTER PUBLICATION supabase_realtime ADD TABLE visit_logs;

-- ═══════════════════════════════════════════════════════
-- XONG! Kiểm tra Table Editor thấy 2 bảng là OK
-- ═══════════════════════════════════════════════════════
