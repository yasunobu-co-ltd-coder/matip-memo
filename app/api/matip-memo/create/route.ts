import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import { sendPushToAll } from '../../../../lib/push';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// POST /api/matip-memo/create
// matip-memo INSERT → 全有効購読へ Web Push → notification_log 保存
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      created_by,      // UUID (users.id)
      client_name,
      memo,
      due_date,
      importance,
      profit,
      urgency,
      assignment_type,
      assignee,
      status,
    } = body;

    // --- バリデーション ---
    if (!created_by || !memo) {
      return NextResponse.json(
        { error: 'created_by (UUID) and memo are required' },
        { status: 400 },
      );
    }

    // --- 1) matip-memo INSERT ---
    const { data: deal, error: insertErr } = await supabaseAdmin
      .from('matip-memo')
      .insert([{
        created_by,
        client_name: client_name || '',
        memo,
        due_date: due_date || null,
        importance: importance || '中',
        profit: profit || '中',
        urgency: urgency || '中',
        assignment_type: assignment_type || '自分で',
        assignee: assignee || created_by,
        status: status || 'open',
      }])
      .select('id, created_at, created_by, client_name, memo, due_date, importance, profit, urgency, assignment_type, assignee, status')
      .single();

    if (insertErr) {
      console.error('[matip-memo/create] insert error:', insertErr.message);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // --- 2) 作成者・担当者の名前を一括取得 ---
    const userIds = [...new Set([created_by, deal.assignee])];
    const { data: userRows } = await supabaseAdmin
      .from('users').select('id, name').in('id', userIds);
    const userMap = new Map((userRows || []).map((u: { id: string; name: string }) => [u.id, u.name]));

    const createdName = userMap.get(created_by) ?? '誰か';
    const assigneeName = userMap.get(deal.assignee) ?? null;

    // レスポンス用に JOIN 相当のフィールドを付与
    const dealWithNames = {
      ...deal,
      created_user: userMap.has(created_by) ? { name: createdName } : null,
      assignee_user: assigneeName ? { name: assigneeName } : null,
    };

    // --- 3) Push通知（after() でレスポンス返却後にバックグラウンド実行） ---
    const title = `${createdName}がメモ追加`;
    const notifBody = client_name
      ? `${client_name}: ${memo}`.slice(0, 180)
      : memo.slice(0, 180);

    after(async () => {
      try {
        await sendPushToAll(
          { title, body: notifBody, url: '/', memo_id: deal.id },
          created_by,
          deal.id,
        );
      } catch (err) {
        console.error('[matip-memo/create] push error:', err);
      }
    });

    // --- 4) 作成されたレコードを返却（Push完了を待たず即レスポンス） ---
    return NextResponse.json({ deal: dealWithNames });
  } catch (e) {
    console.error('[matip-memo/create] exception:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
