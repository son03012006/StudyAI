import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BookOpen,
  Plus,
  Trash2,
  Search,
  AlertCircle,
  CheckCircle2,
  X,
  Loader2,
  Sparkles,
  GraduationCap,
  Calendar,
  FileText,
  RefreshCw,
  FolderOpen,
  ArrowLeft,
  ChevronRight,
  MessageSquare,
  Award,
  User,
  Calculator,
  Compass,
  CheckSquare,
  BarChart3,
  Lightbulb
} from 'lucide-react';
import subjectService from './services/subjectService';
import documentService from './services/documentService';
import authService from './services/authService';

import DocumentList from './components/DocumentList';
import AIChatWindow from './components/AIChatWindow';
import QuizModule from './components/QuizModule';
import AuthModal from './components/AuthModal';
import ProfileModal from './components/ProfileModal';
import StudyPlanner from './components/StudyPlanner';
import AIProblemSolver from './components/AIProblemSolver';
import Notes from './components/Notes';
import Dashboard from './components/Dashboard';

export default function App() {
  // Navigation / Main View State
  const [currentView, setCurrentView] = useState('subjects'); // 'subjects' | 'planner' | 'solver'
  const [activeSubject, setActiveSubject] = useState(null);
  const [activeTab, setActiveTab] = useState('documents'); // 'documents' | 'chat' | 'quiz'
  const [selectedDocId, setSelectedDocId] = useState(null);

  // User Auth State
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Subject List State
  const [subjects, setSubjects] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Documents State (for active subject)
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  // Subject Create Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete Subject Modal State
  const [deletingId, setDeletingId] = useState(null);
  const [subjectToDelete, setSubjectToDelete] = useState(null);

  // Toast Notification State
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  }, []);

  // Check saved user on mount
  useEffect(() => {
    const saved = authService.getCurrentUser();
    if (saved) setCurrentUser(saved);
  }, []);

  // Fetch subjects list from backend
  const fetchSubjects = async () => {
    if (!localStorage.getItem('studyai_token')) {
      setSubjects([]);
      setLoadingSubjects(false);
      return;
    }
    try {
      setLoadingSubjects(true);
      const res = await subjectService.getAll();
      if (res && res.success) {
        setSubjects(res.data || []);
      } else {
        setSubjects(res || []);
      }
    } catch (err) {
      console.error('Lỗi khi tải môn học:', err);
      showToast(err.message || 'Không thể kết nối đến máy chủ Backend.', 'error');
    } finally {
      setLoadingSubjects(false);
    }
  };

  useEffect(() => {
    fetchSubjects();
  }, []);

  // Fetch documents for the active subject
  const fetchDocuments = useCallback(async (subjectId) => {
    if (!subjectId) return;
    try {
      setLoadingDocs(true);
      const res = await documentService.getBySubject(subjectId);
      if (res && res.success) {
        setDocuments(res.data || []);
        setSubjects((prev) =>
          prev.map((s) =>
            s.id === subjectId ? { ...s, document_count: res.data.length } : s
          )
        );
      }
    } catch (err) {
      console.error('Lỗi khi tải tài liệu:', err);
      showToast(err.message || 'Không thể tải danh sách tài liệu.', 'error');
    } finally {
      setLoadingDocs(false);
    }
  }, [showToast]);

  // When switching active subject
  useEffect(() => {
    if (activeSubject) {
      fetchDocuments(activeSubject.id);
      setActiveTab('documents');
      setSelectedDocId(null);
    }
  }, [activeSubject, fetchDocuments]);

  // Filtered subjects based on search query
  const filteredSubjects = useMemo(() => {
    if (!searchQuery.trim()) return subjects;
    const query = searchQuery.toLowerCase();
    return subjects.filter(
      (s) =>
        s.code.toLowerCase().includes(query) ||
        s.name.toLowerCase().includes(query)
    );
  }, [subjects, searchQuery]);

  // Total documents across all subjects
  const totalAllDocuments = useMemo(() => {
    return subjects.reduce((sum, s) => sum + (s.document_count || 0), 0);
  }, [subjects]);

  // Handle open/close add subject modal
  const handleOpenModal = () => {
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }
    setCode('');
    setName('');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (submitting) return;
    setIsModalOpen(false);
    setFormError('');
  };

  // Create subject submit
  const handleCreateSubject = async (e) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setFormError('Vui lòng điền đầy đủ Mã môn học và Tên môn học.');
      return;
    }

    try {
      setSubmitting(true);
      setFormError('');
      const res = await subjectService.create({
        code: code.trim().toUpperCase(),
        name: name.trim(),
      });

      if (res && res.success) {
        showToast(`Đã thêm môn học: ${res.data.name} (${res.data.code})`);
        setSubjects((prev) => [res.data, ...prev]);
        handleCloseModal();
      }
    } catch (err) {
      setFormError(err.message || 'Không thể thêm môn học. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  // Confirm delete subject
  const confirmDelete = async () => {
    if (!subjectToDelete) return;
    try {
      setDeletingId(subjectToDelete.id);
      await subjectService.delete(subjectToDelete.id);
      setSubjects((prev) => prev.filter((s) => s.id !== subjectToDelete.id));
      if (activeSubject && activeSubject.id === subjectToDelete.id) {
        setActiveSubject(null);
      }
      showToast(`Đã xóa thành công môn học "${subjectToDelete.name}".`);
      setSubjectToDelete(null);
    } catch (err) {
      showToast(err.message || 'Không thể xóa môn học.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // Switch to chat tab with specific document
  const handleSelectDocForChat = (docId) => {
    setSelectedDocId(docId);
    setActiveTab('chat');
  };

  // Switch to quiz tab with specific document
  const handleSelectDocForQuiz = (docId) => {
    setSelectedDocId(docId);
    setActiveTab('quiz');
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Gần đây';
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(date);
    } catch {
      return dateString;
    }
  };

  const handleLogout = () => {
    authService.logout();
    setCurrentUser(null);
    setSubjects([]);
    setDocuments([]);
    setActiveSubject(null);
    setCurrentView('subjects');
    showToast('Đã đăng xuất tài khoản.');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-top-3 ${
            toast.type === 'error'
              ? 'bg-rose-50/95 border-rose-200 text-rose-800'
              : 'bg-emerald-50/95 border-emerald-200 text-emerald-800'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          )}
          <span className="text-sm font-semibold">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="p-1 hover:bg-black/5 rounded-lg transition-colors ml-2"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          {/* Logo & Navigation */}
          <div className="flex items-center gap-6">
            <button
              onClick={() => {
                setActiveSubject(null);
                setCurrentView('subjects');
              }}
              className="flex items-center gap-3 text-left hover:opacity-90 transition-opacity"
            >
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-400 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 ring-4 ring-indigo-50">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                    EduMind AI
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    <Sparkles className="w-3 h-3 mr-1 text-indigo-500" />
                    StudyAI
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 hidden sm:block">
                  Trợ lý Học tập Thông minh & Tự nghiên cứu
                </p>
              </div>
            </button>

            {/* Main Navigation Tabs */}
            <nav className="hidden md:flex items-center p-1 bg-slate-100 rounded-2xl gap-1">
              <button
                onClick={() => {
                  setActiveSubject(null);
                  setCurrentView('subjects');
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  currentView === 'subjects' && !activeSubject
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Môn học & Giáo trình</span>
              </button>

              <button
                onClick={() => {
                  setActiveSubject(null);
                  setCurrentView('dashboard');
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  currentView === 'dashboard'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Thống kê</span>
              </button>

              <button
                onClick={() => {
                  setActiveSubject(null);
                  setCurrentView('planner');
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  currentView === 'planner'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Lộ trình Ôn thi</span>
              </button>

              <button
                onClick={() => {
                  setActiveSubject(null);
                  setCurrentView('solver');
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  currentView === 'solver'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Lightbulb className="w-3.5 h-3.5" />
                <span>Giải bài tập & Kiến thức</span>
              </button>

              <button
                onClick={() => {
                  setActiveSubject(null);
                  setCurrentView('notes');
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  currentView === 'notes'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Ghi chú</span>
              </button>
            </nav>
          </div>

          {/* Action Header Button: User Profile & Add Subject */}
          <div className="flex items-center gap-3">
            {/* User Profile / Login */}
            {currentUser ? (
              <button
                onClick={() => setIsProfileModalOpen(true)}
                className="inline-flex items-center gap-2 pl-2 pr-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl transition-all"
              >
                <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                  {currentUser.name?.charAt(0).toUpperCase()}
                </div>
                <div className="text-left hidden sm:block">
                  <div className="text-xs font-bold leading-tight">{currentUser.name}</div>
                  <div className="text-[10px] text-slate-400 leading-tight truncate max-w-[120px]">
                    {currentUser.school || 'Sinh viên'}
                  </div>
                </div>
              </button>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors"
              >
                <User className="w-3.5 h-3.5" />
                <span>Đăng nhập / Đăng ký</span>
              </button>
            )}

            <button
              onClick={() =>
                activeSubject
                  ? fetchDocuments(activeSubject.id)
                  : fetchSubjects()
              }
              disabled={loadingSubjects || loadingDocs}
              title="Làm mới dữ liệu"
              className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:text-indigo-600 hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${
                  loadingSubjects || loadingDocs
                    ? 'animate-spin text-indigo-600'
                    : ''
                }`}
              />
            </button>

            {!activeSubject && currentView === 'subjects' && (
              <button
                onClick={handleOpenModal}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold rounded-xl shadow-sm shadow-indigo-600/30 hover:shadow-indigo-600/50 transition-all duration-200 active:scale-95 text-xs sm:text-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm Môn Học</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile secondary navigation */}
        <div className="flex md:hidden items-center justify-around px-4 py-2 border-t border-slate-100 bg-slate-50/50 text-xs font-bold text-slate-600">
          <button
            onClick={() => {
              setActiveSubject(null);
              setCurrentView('subjects');
            }}
            className={`py-1 ${currentView === 'subjects' && !activeSubject ? 'text-indigo-600 font-extrabold' : ''}`}
          >
            Môn học
          </button>
          <button
            onClick={() => {
              setActiveSubject(null);
              setCurrentView('dashboard');
            }}
            className={`py-1 ${currentView === 'dashboard' ? 'text-indigo-600 font-extrabold' : ''}`}
          >
            Thống kê
          </button>
          <button
            onClick={() => {
              setActiveSubject(null);
              setCurrentView('planner');
            }}
            className={`py-1 ${currentView === 'planner' ? 'text-indigo-600 font-extrabold' : ''}`}
          >
            Lộ trình học
          </button>
          <button
            onClick={() => {
              setActiveSubject(null);
              setCurrentView('solver');
            }}
            className={`py-1 ${currentView === 'solver' ? 'text-indigo-600 font-extrabold' : ''}`}
          >
            Giải bài tập
          </button>
          <button
            onClick={() => {
              setActiveSubject(null);
              setCurrentView('notes');
            }}
            className={`py-1 ${currentView === 'notes' ? 'text-indigo-600 font-extrabold' : ''}`}
          >
            Ghi chú
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ================= VIEW 1: SUBJECT DETAIL VIEW ================= */}
        {activeSubject ? (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Breadcrumb & Subject Header */}
            <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-xs">
              <button
                onClick={() => setActiveSubject(null)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 mb-4 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Quay lại danh sách môn học</span>
              </button>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <span className="px-3 py-1 rounded-lg text-xs font-bold tracking-wider bg-indigo-600 text-white shadow-xs">
                      {activeSubject.code}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">
                      Tạo ngày {formatDate(activeSubject.created_at)}
                    </span>
                  </div>
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                    {activeSubject.name}
                  </h1>
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-700">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    <span>{documents.length} tài liệu giáo trình</span>
                  </span>
                </div>
              </div>

              {/* 3 Navigation Tabs */}
              <div className="flex items-center gap-2 mt-6 pt-5 border-t border-slate-100 overflow-x-auto no-scrollbar">
                <button
                  onClick={() => setActiveTab('documents')}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
                    activeTab === 'documents'
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>Tài liệu bài giảng</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                      activeTab === 'documents'
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {documents.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('chat')}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
                    activeTab === 'chat'
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Hỏi đáp Trợ lý AI</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                </button>

                <button
                  onClick={() => setActiveTab('quiz')}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
                    activeTab === 'quiz'
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Award className="w-4 h-4" />
                  <span>Ôn tập & Luyện thi</span>
                </button>
              </div>
            </div>

            {/* Tab Contents */}
            <div>
              {activeTab === 'documents' && (
                <DocumentList
                  subject={activeSubject}
                  documents={documents}
                  loading={loadingDocs}
                  onRefresh={() => fetchDocuments(activeSubject.id)}
                  onSelectDocumentForChat={handleSelectDocForChat}
                  onSelectDocumentForQuiz={handleSelectDocForQuiz}
                  showToast={showToast}
                />
              )}

              {activeTab === 'chat' && (
                <AIChatWindow
                  subject={activeSubject}
                  documents={documents}
                  selectedDocId={selectedDocId}
                  onSelectDocId={setSelectedDocId}
                  showToast={showToast}
                />
              )}

              {activeTab === 'quiz' && (
                <QuizModule
                  subject={activeSubject}
                  documents={documents}
                  selectedDocId={selectedDocId}
                  onSelectDocId={setSelectedDocId}
                  showToast={showToast}
                />
              )}
            </div>
          </div>
        ) : currentView === 'planner' ? (
          /* ================= VIEW 2: STUDY PLANNER ================= */
          <StudyPlanner subjects={subjects} showToast={showToast} />
        ) : currentView === 'solver' ? (
          /* ================= VIEW 3: PROBLEM SOLVER & EXPLAINER ================= */
          <AIProblemSolver subjects={subjects} showToast={showToast} />
        ) : currentView === 'dashboard' ? (
          <Dashboard showToast={showToast} />
        ) : currentView === 'notes' ? (
          <Notes subjects={subjects} showToast={showToast} />
        ) : (
          /* ================= VIEW 4: SUBJECTS LIST VIEW ================= */
          <div>
            {/* Banner Section */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-10 mb-8 shadow-xl">
              <div className="relative z-10 max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-medium mb-3">
                  <BookOpen className="w-3.5 h-3.5" /> Trợ lý Học tập & Tự nghiên cứu
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2">
                  Chào mừng bạn đến với EduMind AI
                </h1>
                <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                  Quản lý môn học, tải tài liệu giáo trình để AI tóm tắt bài giảng, giải bài tập từng bước, lập kế hoạch ôn thi và luyện trắc nghiệm thông minh.
                </p>

                {/* Quick Shortcuts */}
                <div className="flex flex-wrap items-center gap-3 mt-5">
                  <button
                    onClick={() => setCurrentView('planner')}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur-md transition-all"
                  >
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" /> Lập lộ trình ôn thi
                  </button>
                  <button
                    onClick={() => setCurrentView('solver')}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur-md transition-all"
                  >
                    <Lightbulb className="w-3.5 h-3.5 text-amber-400" /> Giải thích kiến thức
                  </button>
                </div>
              </div>
              <div className="absolute right-0 bottom-0 translate-x-10 translate-y-10 opacity-15 pointer-events-none">
                <GraduationCap className="w-80 h-80 text-white" />
              </div>
            </div>

            {/* Quick Stats Summary Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-lg font-extrabold text-slate-900">{subjects.length}</div>
                  <div className="text-xs text-slate-400 font-medium">Môn học đang theo dõi</div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-lg font-extrabold text-slate-900">{totalAllDocuments}</div>
                  <div className="text-xs text-slate-400 font-medium">Tài liệu đã lưu trữ</div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-lg font-extrabold text-slate-900">Quiz & Flashcard</div>
                  <div className="text-xs text-slate-400 font-medium">Chế độ ôn thi AI</div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-lg font-extrabold text-slate-900">Lộ trình AI</div>
                  <div className="text-xs text-slate-400 font-medium">Kế hoạch cá nhân hóa</div>
                </div>
              </div>
            </div>

            {/* Toolbar: Stats & Search Filter */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-800">Danh sách môn học</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">
                  {filteredSubjects.length} / {subjects.length}
                </span>
              </div>

              {/* Search Box */}
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm mã hoặc tên môn..."
                  className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all shadow-xs"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 rounded-md"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Loading State */}
            {loadingSubjects && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {[1, 2, 3, 4, 5, 6].map((idx) => (
                  <div
                    key={idx}
                    className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs animate-pulse"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-20 h-6 bg-slate-200 rounded-lg"></div>
                      <div className="w-8 h-8 bg-slate-200 rounded-lg"></div>
                    </div>
                    <div className="w-3/4 h-5 bg-slate-200 rounded-md mb-3"></div>
                    <div className="w-1/2 h-4 bg-slate-100 rounded-md mb-6"></div>
                    <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                      <div className="w-20 h-4 bg-slate-200 rounded"></div>
                      <div className="w-24 h-4 bg-slate-200 rounded"></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty State: No subjects created yet */}
            {!loadingSubjects && subjects.length === 0 && (
              <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center max-w-md mx-auto shadow-xs my-8">
                <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 ring-8 ring-indigo-50/50">
                  <FolderOpen className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-1">
                  Chưa có môn học nào
                </h3>
                <p className="text-sm text-slate-500 mb-6">
                  Bắt đầu bằng việc thêm môn học đầu tiên để lưu trữ tài liệu và sử dụng AI local.
                </p>
                <button
                  onClick={handleOpenModal}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl shadow-sm hover:shadow transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Thêm môn học ngay
                </button>
              </div>
            )}

            {/* Empty State: Search found nothing */}
            {!loadingSubjects && subjects.length > 0 && filteredSubjects.length === 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center max-w-sm mx-auto shadow-xs my-6">
                <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-slate-700 mb-1">
                  Không tìm thấy môn học
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Không có môn học nào khớp với từ khóa "{searchQuery}".
                </p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                >
                  Xóa bộ lọc tìm kiếm
                </button>
              </div>
            )}

            {/* Subject Cards Grid */}
            {!loadingSubjects && filteredSubjects.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredSubjects.map((sub) => (
                  <div
                    key={sub.id}
                    onClick={() => setActiveSubject(sub)}
                    className="group relative bg-white border border-slate-200/90 hover:border-indigo-400 rounded-3xl p-5 shadow-xs hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between cursor-pointer"
                  >
                    <div>
                      {/* Top: Subject Code & Action */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <span className="inline-flex items-center px-3 py-1 rounded-xl text-xs font-bold tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-200">
                          {sub.code}
                        </span>

                        {/* Delete action button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSubjectToDelete(sub);
                          }}
                          disabled={deletingId === sub.id}
                          title="Xóa môn học"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        >
                          {deletingId === sub.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-rose-600" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      {/* Subject Name */}
                      <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2 mb-2">
                        {sub.name}
                      </h3>
                    </div>

                    {/* Footer Info: Document count & Created date */}
                    <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <div className="flex items-center gap-1.5 font-medium text-slate-600">
                        <FileText className="w-3.5 h-3.5 text-indigo-500" />
                        <span>{sub.document_count || 0} tài liệu</span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-400 group-hover:text-indigo-600 font-semibold transition-colors">
                        <span>Vào học phần</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal: Thêm Môn Học Mới */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={handleCloseModal}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
          />

          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                  <BookOpen className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Thêm Môn Học Mới
                </h3>
              </div>
              <button
                onClick={handleCloseModal}
                disabled={submitting}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleCreateSubject} className="p-6">
              {formError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Mã môn học <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="VD: INT3306, CS101, MAT1093"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold uppercase placeholder:normal-case placeholder:font-normal placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Mã định danh duy nhất của học phần.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Tên môn học <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="VD: Trí tuệ nhân tạo, Cấu trúc dữ liệu..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-semibold rounded-xl shadow-sm hover:shadow transition-all disabled:opacity-60"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{submitting ? 'Đang lưu...' : 'Lưu môn học'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Xóa Môn Học */}
      {subjectToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => !deletingId && setSubjectToDelete(null)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
          />
          <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200 p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Xác nhận xóa môn học?
            </h3>
            <p className="text-sm text-slate-500 mb-5 leading-relaxed">
              Bạn có chắc chắn muốn xóa môn học{' '}
              <strong className="text-slate-800">"{subjectToDelete.name}"</strong> (
              {subjectToDelete.code})? Tất cả tài liệu liên quan sẽ bị xóa theo.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setSubjectToDelete(null)}
                disabled={deletingId !== null}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deletingId !== null}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-all disabled:opacity-60"
              >
                {deletingId ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>{deletingId ? 'Đang xóa...' : 'Xóa ngay'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auth Modal (Đăng nhập / Đăng ký) */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={(user) => {
          setCurrentUser(user);
          fetchSubjects();
        }}
        showToast={showToast}
      />

      {/* Profile Modal (Hồ sơ sinh viên & Thống kê) */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        user={currentUser}
        onUpdateUser={(updated) => setCurrentUser(updated)}
        onLogout={handleLogout}
        showToast={showToast}
      />

      {/* Footer */}
      <footer className="mt-auto py-6 border-t border-slate-200/80 bg-white text-center text-xs text-slate-400">
        <p>© 2026 EduMind AI • Hệ thống Trợ lý Học tập Thông minh & Tự nghiên cứu dành cho Sinh viên</p>
      </footer>
    </div>
  );
}
