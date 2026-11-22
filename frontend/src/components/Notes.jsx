import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import api from '../services/api';

const emptyNote = { id: null, title: '', content: '', subject_id: '' };

export default function Notes({ subjects = [], showToast }) {
  const [notes, setNotes] = useState([]);
  const [note, setNote] = useState(emptyNote);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadNotes = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/notes');
      const loadedNotes = response.data?.data || [];
      setNotes(loadedNotes);
      setNote((current) => current.id
        ? (loadedNotes.find((item) => item.id === current.id) || emptyNote)
        : current);
    } catch (requestError) {
      setError(requestError.message || 'Không thể tải ghi chú.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  const saveNote = async (event) => {
    event.preventDefault();
    if (!note.title.trim()) {
      setError('Hãy nhập tiêu đề ghi chú.');
      return;
    }
    try {
      setSaving(true);
      setError('');
      const payload = { title: note.title.trim(), content: note.content, subject_id: note.subject_id || null };
      const response = note.id
        ? await api.put(`/notes/${note.id}`, payload)
        : await api.post('/notes', payload);
      const saved = response.data?.data;
      setNotes((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setNote(saved);
      showToast?.(note.id ? 'Đã cập nhật ghi chú.' : 'Đã tạo ghi chú.');
    } catch (requestError) {
      setError(requestError.message || 'Không thể lưu ghi chú.');
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = async () => {
    if (!note.id || !window.confirm(`Xóa ghi chú "${note.title}"?`)) return;
    try {
      setSaving(true);
      await api.delete(`/notes/${note.id}`);
      setNotes((current) => current.filter((item) => item.id !== note.id));
      setNote(emptyNote);
      showToast?.('Đã xóa ghi chú.');
    } catch (requestError) {
      setError(requestError.message || 'Không thể xóa ghi chú.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-gradient-to-r from-indigo-700 to-violet-700 p-6 text-white shadow-lg sm:p-8">
        <div className="flex items-center gap-3"><FileText className="h-8 w-8" /><div><h1 className="text-2xl font-bold">Ghi chú cá nhân</h1><p className="mt-1 text-sm text-indigo-100">Lưu kiến thức của bạn theo từng môn học.</p></div></div>
        <button type="button" onClick={() => { setNote(emptyNote); setError(''); }} className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/25"><Plus className="h-4 w-4" /> Ghi chú mới</button>
      </header>

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-2">
          <h2 className="px-1 text-sm font-bold text-slate-700">Danh sách ({notes.length})</h2>
          {loading && <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-indigo-600" /></div>}
          {!loading && notes.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">Chưa có ghi chú.</p>}
          {notes.map((item) => (
            <button key={item.id} type="button" onClick={() => { setNote(item); setError(''); }} className={`w-full rounded-xl border p-3 text-left ${note.id === item.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
              <span className="block truncate text-sm font-semibold text-slate-800">{item.title}</span>
              <span className="mt-1 block text-xs text-slate-500">{item.subject_name || 'Chưa gắn môn học'}</span>
              <span className="mt-1 block text-[11px] text-slate-400">{new Date(item.updated_at || item.created_at).toLocaleDateString('vi-VN')}</span>
            </button>
          ))}
        </aside>
        <form onSubmit={saveNote} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="block space-y-1 text-sm font-semibold text-slate-700">Tiêu đề<input required maxLength={200} value={note.title} onChange={(event) => setNote({ ...note, title: event.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" placeholder="Tên ghi chú" /></label>
          <label className="block space-y-1 text-sm font-semibold text-slate-700">Môn học<select value={note.subject_id || ''} onChange={(event) => setNote({ ...note, subject_id: event.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal"><option value="">Không gắn môn học</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.code} - {subject.name}</option>)}</select></label>
          <label className="block space-y-1 text-sm font-semibold text-slate-700">Nội dung<textarea maxLength={50000} rows={16} value={note.content || ''} onChange={(event) => setNote({ ...note, content: event.target.value })} className="w-full resize-y rounded-xl border border-slate-300 px-3 py-3 font-normal" placeholder="Ghi lại định nghĩa, công thức hoặc nội dung cần nhớ..." /></label>
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          <div className="flex flex-wrap justify-between gap-2">
            {note.id ? <button type="button" onClick={deleteNote} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-4 w-4" /> Xóa</button> : <span />}
            <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{note.id ? 'Lưu thay đổi' : 'Tạo ghi chú'}</button>
          </div>
        </form>
      </div>
    </section>
  );
}