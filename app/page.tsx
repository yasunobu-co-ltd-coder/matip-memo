'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Deal, Tri, AssignmentType, getDeals, createDeal, updateDeal, deleteDeal } from '../lib/deals';
import { User, getUsers, addUser, deleteUser } from '../lib/users';

// PIN認証コード
const VALID_PIN = '8004';

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDate(ymd: string) {
  if (!ymd) return '—';
  const [, m, d] = ymd.split('-');
  return `${m}/${d}`;
}

export default function Page() {
  // Auth State
  const [isPinVerified, setIsPinVerified] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

  // Config
  const [me, setMe] = useState<string>('');
  const [users, setUsers] = useState<User[]>([]);
  const [isEditingUsers, setIsEditingUsers] = useState(false);
  const [newUserName, setNewUserName] = useState('');

  // Data
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  // View State
  const [view, setView] = useState<'home' | 'list'>('home');
  const [modal, setModal] = useState<'none' | 'minutes' | 'photo'>('none');

  // Form State
  const [clientName, setClientName] = useState('');
  const [memo, setMemo] = useState('');
  const [dueDate, setDueDate] = useState(todayYmd());
  const [imageUrl, setImageUrl] = useState(''); // For preview and saving
  const [isProcessing, setIsProcessing] = useState(false);

  // Voice Input Refs
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  // Camera Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check PIN
  useEffect(() => {
    const verified = sessionStorage.getItem('matip_pin_verified');
    if (verified === 'true') setIsPinVerified(true);
  }, []);

  // Load users from Supabase
  const loadUsers = useCallback(async () => {
    const data = await getUsers();
    setUsers(data);
  }, []);

  useEffect(() => {
    if (isPinVerified) loadUsers();
  }, [isPinVerified, loadUsers]);

  // Load deals
  const loadDeals = useCallback(async () => {
    if (!isPinVerified || !me) return;
    setLoading(true);
    const data = await getDeals();
    setDeals(data);
    setLoading(false);
  }, [isPinVerified, me]);

  useEffect(() => {
    loadDeals();
  }, [loadDeals]);

  // Handlers
  const handlePinSubmit = () => {
    if (pin === VALID_PIN) {
      setIsPinVerified(true);
      sessionStorage.setItem('matip_pin_verified', 'true');
    } else {
      setPinError('PINコードが正しくありません');
    }
  };

  const handleLogin = (name: string) => {
    setMe(name);
  };

  const logout = () => {
    setMe('');
    setView('home');
  };

  const handleAddUser = async () => {
    const trimmed = newUserName.trim();
    if (!trimmed) return;
    const created = await addUser(trimmed);
    if (created) {
      setUsers([...users, created]);
      setNewUserName('');
    } else {
      alert('ユーザーの追加に失敗しました');
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (!confirm(`「${user.name}」を削除しますか？`)) return;
    const ok = await deleteUser(user.id);
    if (ok) {
      setUsers(users.filter(u => u.id !== user.id));
    } else {
      alert('ユーザーの削除に失敗しました');
    }
  };

  const resetForm = () => {
    setClientName('');
    setMemo('');
    setDueDate(todayYmd());
    setImageUrl('');
    setModal('none');
  };

  // --- Voice Logic ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await processAudio(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      alert('マイクを使用できません');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processAudio = async (blob: Blob) => {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', blob);
      const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('API Error');
      const data = await res.json();
      const { result } = data;

      if (result) {
        setClientName(result.clientName || '');
        setMemo(result.memo || '');
        if (result.dueDate) setDueDate(result.dueDate);
      }
    } catch (e) {
      alert('音声解析に失敗しました');
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Photo Logic ---
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setModal('photo');
    setIsProcessing(true);

    // Preview
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImageUrl(ev.target?.result as string);
      // AI解析は不要のため、プレビューのみセットして処理終了
      setIsProcessing(false);
    };
    reader.readAsDataURL(file);
  };

  const triggerCamera = () => {
    fileInputRef.current?.click();
  };

  // --- Submission ---
  const saveRecord = async () => {
    if (!clientName && !memo) return;

    // 省略されたフィールドはデフォルト値を使用
    const newDeal = {
      created_by: me,
      client_name: clientName,
      memo: memo,
      due_date: dueDate,
      importance: '中' as Tri,
      profit: '中' as Tri,
      urgency: '中' as Tri,
      assignment_type: '自分で' as AssignmentType,
      assignee: me,
      status: 'open' as const,
      image_url: imageUrl || undefined,
    };

    const created = await createDeal(newDeal);
    if (created) {
      setDeals([created, ...deals]);
      resetForm();
      setView('list'); // 保存後はリストへ
    } else {
      alert('保存に失敗しました');
    }
  };

  // --- Render ---

  // 1. PIN Screen
  if (!isPinVerified) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1 className="brand">matip</h1>
          <p style={{ textAlign: 'center', marginBottom: 20, color: '#666' }}>PINコードを入力</p>
          <input
            type="password"
            className="input-field"
            style={{ textAlign: 'center', fontSize: 24, letterSpacing: 4 }}
            maxLength={4}
            value={pin}
            onChange={e => setPin(e.target.value)}
          />
          <button className="primary-btn" onClick={handlePinSubmit} style={{ marginTop: 20 }}>確認</button>
          {pinError && <p style={{ color: 'red', textAlign: 'center', marginTop: 10 }}>{pinError}</p>}
        </div>
      </div>
    );
  }

  // 2. User Select
  if (!me) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1 className="brand">matip</h1>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <p style={{ margin: 0 }}>担当者を選択</p>
            <button
              onClick={() => setIsEditingUsers(!isEditingUsers)}
              style={{ background: 'none', border: 'none', color: '#3b82f6', fontWeight: 'bold', fontSize: 14, cursor: 'pointer' }}
            >
              {isEditingUsers ? '完了' : '編集'}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {users.map(u => (
              <div key={u.id} style={{ position: 'relative' }}>
                <button className="glass-panel" onClick={() => !isEditingUsers && handleLogin(u.name)} style={{ padding: 20, fontWeight: 'bold', width: '100%' }}>
                  {u.name}
                </button>
                {isEditingUsers && (
                  <button
                    onClick={() => handleDeleteUser(u)}
                    style={{
                      position: 'absolute', top: -8, right: -8,
                      width: 24, height: 24, borderRadius: '50%',
                      background: '#ef4444', color: 'white', border: 'none',
                      fontSize: 14, fontWeight: 'bold', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          {isEditingUsers && (
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <input
                className="input-field"
                value={newUserName}
                onChange={e => setNewUserName(e.target.value)}
                placeholder="新しいユーザー名"
                style={{ flex: 1, margin: 0 }}
                onKeyDown={e => e.key === 'Enter' && handleAddUser()}
              />
              <button
                onClick={handleAddUser}
                style={{ padding: '10px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 12, fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                追加
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 3. Main App
  return (
    <div className="wrap" style={{ background: '#f8fafc', minHeight: '100vh' }}>
      {/* Header */}
      <header className="topbar">
        <div className="brand">matip <span style={{ fontSize: 10, opacity: 0.7 }}>pocket</span></div>
        <div onClick={logout} style={{ fontSize: 12, fontWeight: 'bold' }}>{me}</div>
      </header>

      {/* Hidden File Input */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handlePhotoSelect}
      />

      <div className="content">

        {/* VIEW: HOME */}
        {view === 'home' && modal === 'none' && (
          <div style={{ paddingTop: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 20, color: '#334155' }}>作業を選択</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Card 1: Minutes */}
              <button
                className="action-card"
                onClick={() => setModal('minutes')}
                style={{
                  background: 'white', border: 'none', borderRadius: 20, padding: 24,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontSize: 40 }}>🎙️</div>
                <div style={{ fontWeight: 'bold', color: '#334155' }}>議事録を作成</div>
              </button>

              {/* Card 2: Photo */}
              <button
                className="action-card"
                onClick={triggerCamera}
                style={{
                  background: 'white', border: 'none', borderRadius: 20, padding: 24,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontSize: 40 }}>📷</div>
                <div style={{ fontWeight: 'bold', color: '#334155' }}>写真を保存</div>
              </button>
            </div>

            <div style={{ marginTop: 40 }}>
              <button
                onClick={() => setView('list')}
                style={{ width: '100%', padding: 16, background: '#e2e8f0', border: 'none', borderRadius: 12, fontWeight: 'bold', color: '#475569' }}
              >
                履歴一覧を見る
              </button>
            </div>
          </div>
        )}

        {/* VIEW: LIST */}
        {view === 'list' && modal === 'none' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 'bold' }}>履歴一覧</h2>
              <button onClick={() => setView('home')} style={{ background: 'none', border: 'none', color: '#3b82f6', fontWeight: 'bold' }}>ホームへ</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {loading ? <p>読み込み中...</p> : deals.map(d => (
                <div key={d.id} style={{ background: 'white', padding: 12, borderRadius: 12, boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', gap: 12 }}>
                  {/* Thumbnail */}
                  <div style={{ width: 60, height: 60, background: '#f1f5f9', borderRadius: 8, flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {d.image_url ? (
                      <img src={d.image_url} alt="thumb" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: 24 }}>📝</span>
                    )}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ fontWeight: 'bold', fontSize: 14 }}>{d.client_name || '名称なし'}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{fmtDate(d.created_at.split('T')[0])}</div>
                    </div>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {d.memo}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MODAL: MINUTES / PHOTO RESULT */}
        {modal !== 'none' && (
          <div style={{ background: 'white', borderRadius: 20, padding: 20, marginTop: 10, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16 }}>
              {modal === 'minutes' ? '議事録作成' : '写真記録'}
            </h2>

            {/* If Minutes: Rec controls */}
            {modal === 'minutes' && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isProcessing}
                  style={{
                    width: 60, height: 60, borderRadius: '50%',
                    background: isRecording ? '#ef4444' : '#3b82f6',
                    color: 'white', border: 'none', fontSize: 24,
                    boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
                  }}
                >
                  {isProcessing ? '...' : (isRecording ? '⏹' : '🎙')}
                </button>
              </div>
            )}

            {/* Preview Image if exists */}
            {imageUrl && (
              <div style={{ marginBottom: 16, borderRadius: 12, overflow: 'hidden', maxHeight: 200 }}>
                <img src={imageUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}

            {/* Analysis Loading */}
            {isProcessing && (
              <div style={{ textAlign: 'center', padding: 20, color: '#64748b' }}>
                {modal === 'minutes' ? '音声を解析中...' : '画像を解析中...'}
              </div>
            )}

            {/* Result Form */}
            {!isProcessing && (
              <>
                <div className="form-group">
                  <label className="input-label">相手/件名</label>
                  <input className="input-field" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="例: A社 定例会議" />
                </div>

                <div className="form-group">
                  <label className="input-label">内容</label>
                  <textarea className="input-field" rows={5} value={memo} onChange={e => setMemo(e.target.value)} placeholder="内容を入力..." />
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                  <button onClick={resetForm} style={{ flex: 1, padding: 14, background: '#f1f5f9', border: 'none', borderRadius: 12, fontWeight: 'bold', color: '#64748b' }}>キャンセル</button>
                  <button onClick={saveRecord} style={{ flex: 1, padding: 14, background: '#3b82f6', border: 'none', borderRadius: 12, fontWeight: 'bold', color: 'white' }}>保存する</button>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
