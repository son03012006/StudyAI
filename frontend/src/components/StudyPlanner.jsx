import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, Circle, Loader2, Plus, Trash2 } from 'lucide-react';
import api from '../services/api';

const initialForm = { subject_id: '', goal: '', durationDays: 7, hoursPerDay: 2, currentLevel: 'Cơ bản' };

export default function StudyPlanner({ subjects = [], showToast }) {
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [updatingTask, setUpdatingTask] = useState('');
  const [deletingPlan, setDeletingPlan] = useState(null);
  const [error, setError] = useState('');

  const loadPlans = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/ai/study-plans');
      setPlans(response.data?.data || []);
    } catch (requestError) {
      setError(requestError.message || 'Không thể tải kế hoạch học tập.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  const handleCreate = async (event) => {
    event.preventDefault();
    const subject = subjects.find((item) => String(item.id) === form.subject_id);
    if (!subject) {
      setError('Hãy chọn một môn học trước khi tạo kế hoạch.');
      return;
    }
    try {
      setCreating(true);
      setError('');
      await api.post('/ai/study-plan', {
        subject_id: subject.id,
        subjectName: subject.name,
        goal: form.goal,
        durationDays: Number(form.durationDays),
        hoursPerDay: Number(form.hoursPerDay),
        currentLevel: form.currentLevel,
      });
      setForm(initialForm);
      await loadPlans();
      showToast?.('Đã tạo kế hoạch học tập.');
    } catch (requestError) {
      setError(requestError.message || 'Không thể tạo kế hoạch học tập.');
    } finally {
      setCreating(false);
    }
  };

  const toggleTask = async (plan, dayIndex, taskIndex, completed) => {
    const key = `${plan.id}:${dayIndex}:${taskIndex}`;
    try {
      setUpdatingTask(key);
      await api.patch(`/ai/study-plans/${plan.id}/tasks/${dayIndex}/${taskIndex}`, { completed: !completed });
      setPlans((current) => current.map((item) => {
        if (item.id !== plan.id) return item;
        const states = { ...(item.task_states || {}), [`${dayIndex}-${taskIndex}`]: !completed };
        return { ...item, task_states: states, completed_tasks: Object.values(states).filter(Boolean).length };
      }));
    } catch (requestError) {
      showToast?.(requestError.message || 'Không thể cập nhật tiến độ.', 'error');
    } finally {
      setUpdatingTask('');
    }
  };

  const removePlan = async (plan) => {
    try {
      setDeletingPlan(plan.id);
      await api.delete(`/ai/study-plans/${plan.id}`);
      setPlans((current) => current.filter((item) => item.id !== plan.id));
      showToast?.('Đã xóa kế hoạch học tập.');
    } catch (requestError) {
      showToast?.(requestError.message || 'Không thể xóa kế hoạch.', 'error');
    } finally {
      setDeletingPlan(null);
    }
  };

  return (
    <section className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <header className="rounded-3xl bg-gradient-to-r from-indigo-700 to-violet-700 p-6 text-white shadow-lg sm:p-8">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-8 w-8" />
          <div>
            <h1 className="text-2xl font-bold">Kế hoạch học tập</h1>
            <p className="mt-1 text-sm text-indigo-100">Tạo lộ trình cá nhân và theo dõi từng nhiệm vụ.</p>
          </div>
        </div>
      </header>

      <form onSubmit={handleCreate} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <div className="sm:col-span-2"><h2 className="font-bold text-slate-800">Tạo kế hoạch mới</h2></div>
        <label className="space-y-1 text-sm font-medium text-slate-700">
          Môn học
          <select required value={form.subject_id} onChange={(event) => setForm({ ...form, subject_id: event.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5">
            <option value="">Chọn môn học</option>
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.code} - {subject.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">
          Mục tiêu
          <input value={form.goal} onChange={(event) => setForm({ ...form, goal: event.target.value })} maxLength={500} placeholder="Ví dụ: Ôn thi cuối kỳ" className="w-full rounded-xl border border-slate-300 px-3 py-2.5" />
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">
          Thời gian (ngày)
          <input type="number" min="1" max="30" value={form.durationDays} onChange={(event) => setForm({ ...form, durationDays: event.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5" />
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">
          Giờ học mỗi ngày
          <input type="number" min="0.5" max="12" step="0.5" value={form.hoursPerDay} onChange={(event) => setForm({ ...form, hoursPerDay: event.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5" />
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700 sm:col-span-2">
          Trình độ hiện tại
          <select value={form.currentLevel} onChange={(event) => setForm({ ...form, currentLevel: event.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5">
            {['Cơ bản', 'Trung bình', 'Khá', 'Nâng cao'].map((level) => <option key={level}>{level}</option>)}
          </select>
        </label>
        {error && <p role="alert" className="text-sm text-rose-700 sm:col-span-2">{error}</p>}
        <div className="sm:col-span-2">
          <button disabled={creating || subjects.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Tạo lộ trình bằng AI
          </button>
        </div>
      </form>

      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-800">Lộ trình của bạn</h2>
        {loading ? (
          <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /></div>
        ) : plans.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Chưa có kế hoạch học tập. Hãy tạo lộ trình đầu tiên.</p>
        ) : plans.map((plan) => {
          const schedule = plan.plan_schedule || {};
          const states = plan.task_states || {};
          const total = plan.total_tasks || 0;
          const completed = Object.values(states).filter(Boolean).length;
          return (
            <article key={plan.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
                <div>
                  <h3 className="font-bold text-slate-900">{plan.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">{plan.target_goal || 'Mục tiêu học tập'} · {plan.duration_days} ngày</p>
                </div>
                <button aria-label="Xóa kế hoạch" onClick={() => removePlan(plan)} disabled={deletingPlan === plan.id} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50">
                  {deletingPlan === plan.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>
              <div className="px-5 pt-4">
                <div className="mb-2 flex justify-between text-xs font-medium text-slate-500"><span>Tiến độ</span><span>{completed}/{total}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${total ? Math.min(100, (completed / total) * 100) : 0}%` }} /></div>
              </div>
              <div className="grid gap-4 p-5 md:grid-cols-2">
                {(schedule.days || []).map((day, dayIndex) => (
                  <section key={`${plan.id}-${dayIndex}`} className="rounded-xl bg-slate-50 p-4">
                    <h4 className="mb-3 font-semibold text-slate-800">Ngày {day.day || dayIndex + 1}: {day.theme}</h4>
                    <ul className="space-y-2">
                      {(day.tasks || []).map((task, taskIndex) => {
                        const done = Boolean(states[`${dayIndex}-${taskIndex}`]);
                        const key = `${plan.id}:${dayIndex}:${taskIndex}`;
                        return (
                          <li key={key}>
                            <button onClick={() => toggleTask(plan, dayIndex, taskIndex, done)} disabled={updatingTask === key} className="flex w-full items-start gap-2 text-left text-sm text-slate-700 disabled:opacity-60">
                              {updatingTask === key ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-indigo-600" /> : done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
                              <span className={done ? 'text-slate-400 line-through' : ''}>{task}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}