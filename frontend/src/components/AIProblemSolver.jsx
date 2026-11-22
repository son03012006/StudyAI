import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { BookOpenCheck, Brain, Loader2, Sparkles } from 'lucide-react';
import api from '../services/api';

const panelClass = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';

export default function AIProblemSolver({ subjects = [], showToast }) {
  const [mode, setMode] = useState('solve');
  const [problem, setProblem] = useState('');
  const [subject, setSubject] = useState('');
  const [level, setLevel] = useState('student');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (!problem.trim()) {
      setError(mode === 'solve' ? 'Hãy nhập đề bài cần giải.' : 'Hãy nhập khái niệm cần giải thích.');
      return;
    }
    try {
      setLoading(true);
      setError('');
      setResult('');
      const response = mode === 'solve'
        ? await api.post('/ai/solve-exercise', { problem: problem.trim(), subject })
        : await api.post('/ai/explain', { concept: problem.trim(), level });
      if (!response.data?.success) throw new Error('AI không trả về kết quả.');
      setResult(response.data?.data?.solution || response.data?.data?.explanation || '');
    } catch (requestError) {
      setError(requestError.message || 'Không thể nhận phản hồi từ AI Service.');
      showToast?.(requestError.message || 'Không thể kết nối dịch vụ AI.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <header className="rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white shadow-lg sm:p-8">
        <div className="flex items-center gap-3">
          <Brain className="h-8 w-8 text-indigo-300" />
          <div>
            <h1 className="text-2xl font-bold">Trợ lý giải bài tập</h1>
            <p className="mt-1 text-sm text-slate-300">Giải từng bước hoặc giải thích khái niệm bằng AI local.</p>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { setMode('solve'); setResult(''); setError(''); }} className={`rounded-xl px-4 py-2 text-sm font-semibold ${mode === 'solve' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>
          Giải bài tập
        </button>
        <button type="button" onClick={() => { setMode('explain'); setResult(''); setError(''); }} className={`rounded-xl px-4 py-2 text-sm font-semibold ${mode === 'explain' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>
          Giải thích khái niệm
        </button>
      </div>

      <form onSubmit={submit} className={`${panelClass} space-y-4`}>
        <label className="block space-y-2 text-sm font-semibold text-slate-700">
          {mode === 'solve' ? 'Đề bài' : 'Khái niệm hoặc chủ đề'}
          <textarea value={problem} onChange={(event) => setProblem(event.target.value)} maxLength={12000} rows={7} placeholder={mode === 'solve' ? 'Nhập đề bài cần phân tích và giải...' : 'Ví dụ: giải thích độ phức tạp thuật toán Big O'} className="w-full resize-y rounded-xl border border-slate-300 px-3 py-3 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
        </label>
        {mode === 'solve' ? (
          <label className="block space-y-2 text-sm font-semibold text-slate-700">
            Môn học
            <select value={subject} onChange={(event) => setSubject(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal">
              <option value="">Chọn môn hoặc để AI tự nhận diện</option>
              {subjects.map((item) => <option key={item.id} value={item.name}>{item.code} - {item.name}</option>)}
            </select>
          </label>
        ) : (
          <label className="block space-y-2 text-sm font-semibold text-slate-700">
            Mức độ giải thích
            <select value={level} onChange={(event) => setLevel(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal">
              <option value="simple">Cơ bản, dễ hiểu</option>
              <option value="student">Sinh viên đại học</option>
              <option value="expert">Chuyên sâu</option>
              <option value="analogy">Qua ví dụ và ẩn dụ</option>
            </select>
          </label>
        )}
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <button disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'solve' ? <BookOpenCheck className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          {loading ? 'Đang xử lý...' : mode === 'solve' ? 'Giải bài' : 'Giải thích'}
        </button>
      </form>

      {result && (
        <article className={`${panelClass} prose prose-slate max-w-none`}>
          <h2 className="!mt-0 text-lg font-bold">Kết quả</h2>
          <ReactMarkdown>{result}</ReactMarkdown>
        </article>
      )}
    </section>
  );
}