import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Building,
  BookOpen,
  Award,
  Calendar,
  LogOut,
  Save,
  Loader2,
  FileText,
  MessageSquare,
  Layers,
  Sparkles
} from 'lucide-react';
import authService from '../services/authService';

export default function ProfileModal({ isOpen, onClose, user, onUpdateUser, onLogout, showToast }) {
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalSubjects: 0,
    totalDocuments: 0,
    totalChats: 0,
    totalPlans: 0,
  });

  const [name, setName] = useState(user?.name || '');
  const [school, setSchool] = useState(user?.school || '');
  const [major, setMajor] = useState(user?.major || '');
  const [targetGpa, setTargetGpa] = useState(user?.target_gpa || '3.6 / 4.0');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      setName(user.name || '');
      setSchool(user.school || '');
      setMajor(user.major || '');
      setTargetGpa(user.target_gpa || '3.6 / 4.0');

      // Fetch profile & stats
      authService.getProfile().then((res) => {
        if (res?.data?.stats) {
          setStats(res.data.stats);
        }
      }).catch((e) => console.warn(e));
    }
  }, [isOpen, user]);

  if (!isOpen || !user) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const res = await authService.updateProfile({
        name,
        school,
        major,
        target_gpa: targetGpa,
      });

      if (res && res.success) {
        if (showToast) showToast('Cập nhật hồ sơ cá nhân thành công!');
        onUpdateUser(res.data);
        setEditing(false);
      }
    } catch (err) {
      if (showToast) showToast(err.message || 'Không thể lưu thông tin.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    try {
      setPasswordLoading(true);
      await authService.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      if (showToast) showToast('Đổi mật khẩu thành công.');
    } catch (err) {
      if (showToast) showToast(err.message || 'Không thể đổi mật khẩu.', 'error');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div onClick={onClose} className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs" />

      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-3xl shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-lg font-black border border-white/30">
              {user.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="text-base font-bold">{user.name}</h3>
              <p className="text-xs text-indigo-200">{user.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Grid */}
        <div className="p-6 border-b border-slate-100 bg-slate-50/60">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
            Thống kê tiến độ tự học của bạn
          </h4>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="p-2.5 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="text-lg font-extrabold text-indigo-600">
                {stats.totalSubjects}
              </div>
              <div className="text-[10px] text-slate-500 font-semibold mt-0.5">Môn học</div>
            </div>

            <div className="p-2.5 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="text-lg font-extrabold text-sky-600">
                {stats.totalDocuments}
              </div>
              <div className="text-[10px] text-slate-500 font-semibold mt-0.5">Tài liệu</div>
            </div>

            <div className="p-2.5 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="text-lg font-extrabold text-emerald-600">
                {stats.totalChats}
              </div>
              <div className="text-[10px] text-slate-500 font-semibold mt-0.5">Hỏi đáp AI</div>
            </div>

            <div className="p-2.5 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="text-lg font-extrabold text-amber-600">
                {stats.totalPlans}
              </div>
              <div className="text-[10px] text-slate-500 font-semibold mt-0.5">Lộ trình</div>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Thông tin học tập cá nhân
            </h4>
            {!editing ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-bold"
              >
                Chỉnh sửa
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                Hủy
              </button>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Họ và tên
              </label>
              <input
                type="text"
                disabled={!editing}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium disabled:opacity-75 disabled:bg-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                  Trường đại học
                </label>
                <input
                  type="text"
                  disabled={!editing}
                  value={school}
                  onChange={(e) => setSchool(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium disabled:opacity-75 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                  Chuyên ngành
                </label>
                <input
                  type="text"
                  disabled={!editing}
                  value={major}
                  onChange={(e) => setMajor(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium disabled:opacity-75 disabled:bg-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Mục tiêu GPA
              </label>
              <input
                type="text"
                disabled={!editing}
                value={targetGpa}
                onChange={(e) => setTargetGpa(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium disabled:opacity-75 disabled:bg-slate-100"
              />
            </div>
          </div>

          {editing && (
            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Lưu thay đổi</span>
              </button>
            </div>
          )}
        </form>

        <form onSubmit={handleChangePassword} className="px-6 pb-5 space-y-3">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Đổi mật khẩu</h4>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Mật khẩu hiện tại"
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
          />
          <div className="flex gap-2">
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mật khẩu mới (ít nhất 8 ký tự)"
              className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            />
            <button
              type="submit"
              disabled={passwordLoading}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl disabled:opacity-50"
            >
              {passwordLoading ? 'Đang lưu...' : 'Cập nhật'}
            </button>
          </div>
        </form>

        {/* Footer actions */}
        <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between">
          <button
            onClick={() => {
              onLogout();
              onClose();
            }}
            className="inline-flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-800 font-bold p-1 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Đăng xuất
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-xl"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
