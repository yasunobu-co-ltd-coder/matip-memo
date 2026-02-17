import { supabase } from './supabase';

export type User = {
  id: string;
  name: string;
  created_at: string;
};

// ユーザー一覧を取得
export async function getUsers(): Promise<User[]> {
  try {
    const { data, error } = await supabase
      .from('user')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching users:', error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.error('Exception fetching users:', e);
    return [];
  }
}

// ユーザーを追加
export async function addUser(name: string): Promise<User | null> {
  try {
    const { data, error } = await supabase
      .from('user')
      .insert([{ name }])
      .select()
      .single();

    if (error) {
      console.error('Error adding user:', error.message);
      return null;
    }
    return data;
  } catch (e) {
    console.error('Exception adding user:', e);
    return null;
  }
}

// ユーザーを削除
export async function deleteUser(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('user')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting user:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Exception deleting user:', e);
    return false;
  }
}
