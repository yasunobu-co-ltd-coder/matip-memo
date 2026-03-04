import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase-server';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// GET /api/users/[id]/refs
// 指定ユーザーが参照されているレコード件数を返す
// ---------------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: userId } = await params;

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  try {
    // head:true + count:'exact' で件数だけ取得（データ本体は返さない）
    const [
      pocketMatip,
      memoCreated,
      memoAssigned,
      memoUnread,
      pushSubs,
      notifTriggered,
    ] = await Promise.all([
      supabaseAdmin
        .from('pocket-matip')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabaseAdmin
        .from('matip-memo')
        .select('*', { count: 'exact', head: true })
        .eq('created_by', userId),
      supabaseAdmin
        .from('matip-memo')
        .select('*', { count: 'exact', head: true })
        .eq('assignee', userId),
      supabaseAdmin
        .from('matip-memo-unread')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabaseAdmin
        .from('push_subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabaseAdmin
        .from('notification_log')
        .select('*', { count: 'exact', head: true })
        .eq('triggered_by_user_id', userId),
    ]);

    const counts = {
      pocket_matip: pocketMatip.count ?? 0,
      memo_created: memoCreated.count ?? 0,
      memo_assigned: memoAssigned.count ?? 0,
      memo_unread: memoUnread.count ?? 0,
      push_subs: pushSubs.count ?? 0,
      notif_triggered: notifTriggered.count ?? 0,
    };

    const canDelete = Object.values(counts).every(c => c === 0);

    return NextResponse.json({ userId, counts, canDelete });
  } catch (e) {
    console.error('[users/refs] exception:', e);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
