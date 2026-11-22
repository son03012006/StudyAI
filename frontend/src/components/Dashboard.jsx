import { useCallback, useEffect, useState } from 'react';
import { Activity, Award, BookOpen, Calendar, FileText, MessageSquare, RefreshCw } from 'lucide-react';
import dashboardService from '../services/dashboardService';

const metricCards = [
  { key: 'subject_count', label: 'Môn học', icon: BookOpen, tone: 'indigo' },
  { key: 'document_count', label: 'Tài liệu', icon: FileText, tone: 'sky' },
  { key: 'chat_count', label: 'Lượt hỏi đáp', icon: MessageSquare, tone: 'violet' },
  { key: 'quiz_attempt_count', label: 'Lần làm trắc nghiệm', icon: Award, tone: 'emerald' },
];

const toneClasses = {
  indigo: 'bg-indigo-50 text-indigo-600',
  sky: 'bg-sky-50 text-sky-600',
  violet: 'bg-violet-50 text-violet-600',
  emerald: 'bg-emerald-50 text-emerald-600',
};

export default function Dashboard({ showToast }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await dashboardService.getStats();
      if (!response?.success || !response.data) {
        throw new Error('Máy chủ không trả về số liệu tổng quan hợp lệ.');
      }
      setStats(response.data);
    } catch (loadError) {
      setError(loadError.message || 'Không thể tải số liệu tổng quan.');
      if (showToast) showToast(loadError.message || 'Không thể tải số liệu tổng quan.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const weeklyActivity = stats?.weekly_activity || [];
  const maxActivity = Math.max(1, ...weeklyActivity.map((day) => day.study_count + day.quiz_count));

  return (
    <section className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-indigo-600">TỔNG QUAN HỌC TẬP</p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">Dashboard tiến độ</h1>
          <p className="mt-1 text-sm text-slate-500">Số liệu được tổng hợp từ môn học, tài liệu và lịch sử hoạt động của bạn.</p>
        </div>
        <button
          type="button"
          onClick={loadStats}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      {error && !stats && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          <p>{error}</p>
          <button type="button" onClick={loadStats} className="mt-3 font-bold underline">Thử lại</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metricCards.map(({ key, label, icon: Icon, tone }) => (
          <article key={key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClasses[tone]}`}>
              <Icon className="h-5 w-5" />
            </div>
            <p className="mt-4 text-2xl font-extrabold text-slate-900">
              {loading && !stats ? <span className="inline-block h-7 w-12 animate-pulse rounded bg-slate-100" /> : (stats?.[key] ?? 0)}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500 sm:text-sm">{label}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-indigo-600" />
            <h2 className="font-bold text-slate-900">Hoạt động 7 ngày gần nhất</h2>
          </div>
          {weeklyActivity.length ? (
            <div className="mt-6 grid grid-cols-7 items-end gap-2 sm:gap-4">
              {weeklyActivity.map((day) => {
                const count = day.study_count + day.quiz_count;
                const height = count ? Math.max(10, (count / maxActivity) * 100) : 4;
                return (
                  <div key={day.date} className="flex min-w-0 flex-col items-center gap-2">
                    <span className="text-[10px] font-semibold text-slate-500 sm:text-xs">{count}</span>
                    <div className="flex h-28 w-full items-end rounded-lg bg-slate-50 p-1">
                      <div
                        className={`w-full rounded-md ${count ? 'bg-indigo-500' : 'bg-slate-200'}`}
                        style={{ height: `${height}%` }}
                        title={`${day.study_count} hoạt động học, ${day.quiz_count} lần làm trắc nghiệm`}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {new Intl.DateTimeFormat('vi-VN', { weekday: 'short' }).format(new Date(day.date))}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Chưa có hoạt động để thống kê.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" />Hoạt động học và luyện tập</span>
            <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />Kế hoạch: {stats?.plan_count ?? 0}</span>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-bold text-slate-900">Tiến độ & kết quả</h2>
          <div className="mt-5 space-y-4">
            <div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Nhiệm vụ kế hoạch hoàn thành</span>
                <strong className="text-slate-800">{stats?.completed_task_count ?? 0}/{stats?.total_task_count ?? 0}</strong>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${stats?.total_task_count ? Math.min(100, (stats.completed_task_count / stats.total_task_count) * 100) : 0}%` }}
                />
              </div>
            </div>
            <div className="rounded-xl bg-indigo-50 p-4">
              <p className="text-xs font-semibold text-indigo-700">Điểm quiz trung bình</p>
              <p className="mt-1 text-3xl font-extrabold text-indigo-900">{stats?.average_quiz_percentage ?? 0}%</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Quiz gần đây</p>
              {stats?.recent_quizzes?.length ? (
                <ul className="mt-2 space-y-2">
                  {stats.recent_quizzes.map((quiz) => (
                    <li key={quiz.id} className="flex items-start justify-between gap-2 text-xs">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-slate-700">{quiz.document_name}</span>
                        <span className="text-slate-400">{quiz.subject_name}</span>
                      </span>
                      <strong className="shrink-0 text-indigo-700">{quiz.percentage}%</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-400">Chưa có lượt làm quiz.</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
