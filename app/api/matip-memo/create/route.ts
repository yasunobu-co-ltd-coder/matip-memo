import { NextRequest, NextResponse } from 'next/server';
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
      .select()
      .single();

    if (insertErr) {
      console.error('[matip-memo/create] insert error:', insertErr.message);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // --- 2) 作成者の名前を取得（通知文用） ---
    let userName = '誰か';
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('name')
      .eq('id', created_by)
      .single();
    if (userRow?.name) {
      userName = userRow.name;
    }

    // --- 3) Push通知（await — Vercel serverless で確実に完了させる） ---
    const title = `${userName}がメモ追加`;
    const notifBody = client_name
      ? `${client_name}: ${memo}`.slice(0, 180)
      : memo.slice(0, 180);

    try {
      await sendPushToAll(
        { title, body: notifBody, url: '/', memo_id: deal.id },
        created_by,   // triggered_by_user_id
        deal.id,      // memo_id
      );
    } catch (err) {
      // Push失敗でもメモ作成は成功扱い（ログは sendPushToAll 内で保存済み）
      console.error('[matip-memo/create] push error:', err);
    }

    // --- 4) 作成されたレコードを返却 ---
    return NextResponse.json({ deal });
  } catch (e) {
    console.error('[matip-memo/create] exception:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
