-- 既読管理テーブル（matip-memo）
-- 各ユーザーがどのメモを既読したかを記録する
CREATE TABLE IF NOT EXISTS "matip-memo-reads" (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  memo_id uuid NOT NULL REFERENCES "matip-memo"(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(memo_id, user_id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_matip_memo_reads_memo ON "matip-memo-reads"(memo_id);
CREATE INDEX IF NOT EXISTS idx_matip_memo_reads_user ON "matip-memo-reads"(user_id);

-- RLS
ALTER TABLE "matip-memo-reads" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON "matip-memo-reads" FOR ALL USING (true) WITH CHECK (true);
