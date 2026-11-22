import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Upload,
  FileText,
  Trash2,
  Sparkles,
  MessageSquare,
  HelpCircle,
  Loader2,
  CheckCircle,
  AlertCircle,
  X,
  Copy,
  Calendar,
  HardDrive
} from 'lucide-react';
import documentService from '../services/documentService';

export default function DocumentList({
  subject,
  documents,
  loading,
  onRefresh,
  onSelectDocumentForChat,
  onSelectDocumentForQuiz,
  showToast,
}) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [summaryModal, setSummaryModal] = useState({
    isOpen: false,
    doc: null,
    loading: false,
    content: '',
    error: '',
  });
  const [deletingId, setDeletingId] = useState(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef(null);

  // Drag and drop handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handleFileUpload = async (file) => {
    if (!file) return;

    // Kiểm tra định dạng
    const validExtensions = ['.pdf', '.txt', '.docx'];
    const fileName = file.name.toLowerCase();
    const isValid = validExtensions.some((ext) => fileName.endsWith(ext));

    if (!isValid) {
      if (showToast) showToast('Chỉ hỗ trợ file PDF (.pdf) hoặc văn bản (.txt, .docx).', 'error');
      else alert('Chỉ hỗ trợ file PDF (.pdf) hoặc văn bản (.txt, .docx).');
      return;
    }

    try {
      setUploading(true);
      const res = await documentService.upload(file, subject.id);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (showToast) {
        const indexingWarning = res.data?.indexing_warning;
        showToast(indexingWarning || `Tải lên thành công: ${file.name}`, indexingWarning ? 'error' : 'success');
      }
      onRefresh();
    } catch (err) {
      console.error('Lỗi khi tải file:', err);
      if (showToast) showToast(err.message || 'Lỗi khi tải file lên máy chủ.', 'error');
      else alert(err.message || 'Lỗi khi tải file lên máy chủ.');
    } finally {
      setUploading(false);
    }
  };

  // Tóm tắt tài liệu
  const handleSummarize = async (doc) => {
    setSummaryModal({
      isOpen: true,
      doc,
      loading: true,
      content: '',
      error: '',
    });

    try {
      const res = await documentService.summarize(doc.id);
      setSummaryModal((prev) => ({
        ...prev,
        loading: false,
        content: res.data?.summary || 'Không có nội dung tóm tắt.',
      }));
    } catch (err) {
      setSummaryModal((prev) => ({
        ...prev,
        loading: false,
        error: err.message || 'Không thể tạo tóm tắt từ AI.',
      }));
    }
  };

  // Copy tóm tắt
  const handleCopySummary = () => {
    if (!summaryModal.content) return;
    navigator.clipboard.writeText(summaryModal.content);
    setCopied(true);
    if (showToast) showToast('Đã sao chép nội dung tóm tắt vào clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  // Xóa tài liệu
  const handleDeleteDoc = async (docId, fileName) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa tài liệu "${fileName}"?`)) return;

    try {
      setDeletingId(docId);
      await documentService.delete(docId);
      if (showToast) showToast(`Đã xóa tài liệu "${fileName}".`);
      onRefresh();
    } catch (err) {
      if (showToast) showToast(err.message || 'Không thể xóa tài liệu.', 'error');
      else alert(err.message || 'Không thể xóa tài liệu.');
    } finally {
      setDeletingId(null);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      return new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date(dateString));
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Box (Drag & Drop) */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-3xl p-8 sm:p-10 text-center cursor-pointer transition-all duration-200 ${
          dragActive
            ? 'border-indigo-600 bg-indigo-50/70 scale-[1.005]'
            : 'border-slate-300 hover:border-indigo-400 bg-white hover:bg-slate-50/60 shadow-xs'
        } ${uploading ? 'pointer-events-none opacity-80' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.docx"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 transition-colors ${
              dragActive
                ? 'bg-indigo-600 text-white'
                : 'bg-indigo-50 text-indigo-600'
            }`}
          >
            {uploading ? (
              <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
            ) : (
              <Upload className="w-7 h-7" />
            )}
          </div>

          <h4 className="text-base font-bold text-slate-800 mb-1">
            {uploading
              ? 'Đang tải lên & trích xuất dữ liệu...'
              : 'Kéo thả file PDF giáo trình vào đây, hoặc nhấn để duyệt'}
          </h4>
          <p className="text-xs text-slate-500 max-w-sm mb-3">
            Hỗ trợ tài liệu học phần định dạng PDF (tối đa 50MB). AI sẽ tự động đọc nội dung để chuẩn bị cho tóm tắt & hỏi đáp.
          </p>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            <FileText className="w-3.5 h-3.5 text-indigo-600" />
            PDF, TXT, DOCX
          </span>
        </div>
      </div>

      {/* Documents List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <span>Tài liệu đã tải lên</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
              {documents.length}
            </span>
          </h3>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-xs animate-pulse flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-10 h-10 bg-slate-200 rounded-xl" />
                  <div className="space-y-2 flex-1">
                    <div className="w-1/3 h-4 bg-slate-200 rounded" />
                    <div className="w-1/4 h-3 bg-slate-100 rounded" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-7 bg-slate-200 rounded-xl" />
                  <div className="w-16 h-7 bg-slate-200 rounded-xl" />
                  <div className="w-16 h-7 bg-slate-200 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center shadow-xs">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">
              Môn học này chưa có tài liệu nào
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Hãy tải lên tài liệu đầu tiên ở khung phía trên để bắt đầu sử dụng trợ lý AI local.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="bg-white border border-slate-200/90 hover:border-indigo-200 rounded-2xl p-4 sm:p-5 shadow-xs hover:shadow-sm transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                {/* File info */}
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-slate-900 truncate" title={doc.file_name}>
                      {doc.file_name}
                    </h4>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                        {formatFileSize(doc.file_size)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {formatDate(doc.created_at)}
                      </span>
                      {doc.content_length > 0 && (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                          <CheckCircle className="w-3 h-3" /> Đã trích xuất nội dung
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick actions for this document */}
                <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
                  {/* Tóm tắt */}
                  <button
                    onClick={() => handleSummarize(doc)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-xl transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Tóm tắt</span>
                  </button>

                  {/* Chat với tài liệu */}
                  <button
                    onClick={() => onSelectDocumentForChat(doc.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold rounded-xl transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-sky-600" />
                    <span>Hỏi đáp</span>
                  </button>

                  {/* Tạo trắc nghiệm */}
                  <button
                    onClick={() => onSelectDocumentForQuiz(doc.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-xl transition-colors"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Luyện thi</span>
                  </button>

                  {/* Xóa */}
                  <button
                    onClick={() => handleDeleteDoc(doc.id, doc.file_name)}
                    disabled={deletingId === doc.id}
                    title="Xóa tài liệu"
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors ml-1"
                  >
                    {deletingId === doc.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-rose-600" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Tóm tắt tài liệu */}
      {summaryModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => setSummaryModal({ ...summaryModal, isOpen: false })}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
          />

          <div className="relative w-full max-w-2xl max-h-[85vh] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Tóm tắt bài giảng bằng AI local
                  </h3>
                  <p className="text-xs text-slate-500 truncate max-w-md">
                    {summaryModal.doc?.file_name}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {summaryModal.content && (
                  <button
                    onClick={handleCopySummary}
                    title="Sao chép nội dung"
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-indigo-600 bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
                  >
                    {copied ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copied ? 'Đã chép' : 'Sao chép'}</span>
                  </button>
                )}
                <button
                  onClick={() => setSummaryModal({ ...summaryModal, isOpen: false })}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {summaryModal.loading && (
                <div className="space-y-4 py-6">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                    <span className="text-sm font-bold text-slate-700">AI local đang phân tích tài liệu...</span>
                  </div>
                  {/* Skeleton lines */}
                  <div className="space-y-3 pt-2">
                    <div className="h-4 bg-slate-200 rounded w-3/4 animate-pulse" />
                    <div className="h-4 bg-slate-100 rounded w-full animate-pulse" />
                    <div className="h-4 bg-slate-200 rounded w-5/6 animate-pulse" />
                    <div className="h-4 bg-slate-100 rounded w-2/3 animate-pulse" />
                    <div className="h-4 bg-slate-200 rounded w-4/5 animate-pulse" />
                  </div>
                </div>
              )}

              {summaryModal.error && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-bold mb-1">Không thể tạo tóm tắt</h5>
                    <p>{summaryModal.error}</p>
                  </div>
                </div>
              )}

              {!summaryModal.loading && !summaryModal.error && summaryModal.content && (
                <div className="prose prose-sm prose-indigo max-w-none text-slate-800 leading-relaxed">
                  <ReactMarkdown>{summaryModal.content}</ReactMarkdown>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button
                onClick={() => setSummaryModal({ ...summaryModal, isOpen: false })}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
