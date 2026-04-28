-- ═══════════════════════════════════════════════════════════════
-- LÀNG PI — Migration ĐÚNG (khớp với code hiện tại)
-- Chạy trong Supabase Dashboard > SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ── BƯỚC 1: Xóa bảng cũ nếu có (CẢNH BÁO: mất data cũ) ──
-- Nếu bảng đang rỗng hoặc chưa có thì chạy bình thường
-- Nếu đang có data quan trọng thì BỎ QUA 2 dòng DROP này
DROP TABLE IF EXISTS visit_logs;
DROP TABLE IF EXISTS farms;

-- ── BƯỚC 2: Tạo bảng farms ĐÚNG với code ──
CREATE TABLE farms (
  pi_uid       TEXT        PRIMARY KEY,           -- khớp: loadFarm(uid), saveFarm onConflict: 'pi_uid'
  username     TEXT        NOT NULL DEFAULT '',   -- khớp: row.username
  pi_balance   FLOAT       NOT NULL DEFAULT 10,   -- khớp: row.pi_balance
  stars        INT         NOT NULL DEFAULT 0,    -- khớp: row.stars
  plots        JSONB       NOT NULL DEFAULT '[]', -- khớp: row.plots
  inventory    JSONB       NOT NULL DEFAULT '{}', -- khớp: row.inventory
  char_pos     JSONB       NOT NULL DEFAULT '{"x":28,"y":38}', -- khớp: row.char_pos
  avatar       JSONB                DEFAULT '{}', -- khớp: row.avatar (tùy chỉnh nhân vật)
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- ── BƯỚC 3: Tạo bảng visit_logs ĐÚNG với code ──
CREATE TABLE visit_logs (
  id           BIGSERIAL   PRIMARY KEY,
  target_uid   TEXT        NOT NULL,  -- khớp: logVisitEvent({ target_uid })
  visitor_uid  TEXT        NOT NULL,  -- khớp: logVisitEvent({ visitor_uid })
  visitor_name TEXT        NOT NULL DEFAULT '', -- khớp: logVisitEvent({ visitor_name })
  type         TEXT        NOT NULL CHECK (type IN ('water','pest','steal')),
  plot_idx     INT         NOT NULL,
  plant        TEXT,
  amount       FLOAT       DEFAULT 0,
  seen         BOOLEAN     DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ── BƯỚC 4: Index ──
CREATE INDEX IF NOT EXISTS idx_farms_username    ON farms (username);
CREATE INDEX IF NOT EXISTS idx_visits_target     ON visit_logs (target_uid, seen);
CREATE INDEX IF NOT EXISTS idx_visits_created    ON visit_logs (created_at DESC);

-- ── BƯỚC 5: Auto-update updated_at ──
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

-- ── BƯỚC 6: Row Level Security ──
ALTER TABLE farms       ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_logs  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farms_select"  ON farms FOR SELECT USING (true);
CREATE POLICY "farms_insert"  ON farms FOR INSERT WITH CHECK (true);
CREATE POLICY "farms_update"  ON farms FOR UPDATE USING (true);

CREATE POLICY "visits_select" ON visit_logs FOR SELECT USING (true);
CREATE POLICY "visits_insert" ON visit_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "visits_update" ON visit_logs FOR UPDATE USING (true);

-- ── BƯỚC 7: Realtime ──
ALTER PUBLICATION supabase_realtime ADD TABLE farms;
ALTER PUBLICATION supabase_realtime ADD TABLE visit_logs;

-- ── KIỂM TRA KẾT QUẢ ──
SELECT
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name = 'farms'
ORDER BY ordinal_position;
