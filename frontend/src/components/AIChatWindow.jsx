import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Send,
  Bot,
  User,
  Sparkles,
  FileText,
  Loader2,
  Trash2,
  AlertCircle,
  Clock,
  ChevronDown
} from 'lucide-react';
import documentService from '../services/documentService';

export default function AIChatWindow({
  subject,
  documents,
  selectedDocId,
  onSelectDocId,
  showToast,
}) {
  const [messages, setMessages] = useState([]);
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Selected document info
  const currentDoc = documents.find((d) => String(d.id) === String(selectedDocId)) || documents[0];

  useEffect(() => {
    if (!selectedDocId && documents.length > 0) {
      onSelectDocId(documents[0].id);
    }
  }, [documents, selectedDocId, onSelectDocId]);

  // Load chat history from backend whenever currentDoc changes
  useEffect(() => {
    const loadHistory = async () => {
      if (!currentDoc) {
        setMessages([
          {
            id: 'welcome-nodoc',
            sender: 'ai',
            text: `Xin chào! Hãy tải lên tài liệu học tập của môn **${subject.name}** (${subject.code}) để bắt đầu hỏi trợ lý AI local.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
        return;
      }

      try {
        setLoadingHistory(true);
        const res = await documentService.getHistory(currentDoc.id);
        const historyData = res.data || [];

        if (historyData.length > 0) {
          const formatted = [];
          historyData.forEach((item) => {
            formatted.push({
              id: `hist-user-${item.id}`,
              sender: 'user',
              text: item.question,
              timestamp: new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            });
            formatted.push({
              id: `hist-ai-${item.id}`,
              sender: 'ai',
              text: item.answer,
              sources: item.sources || [],
              timestamp: new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            });
          });
          setMessages(formatted);
        } else {
          setMessages([
            {
              id: `welcome-${currentDoc.id}`,
              sender: 'ai',
              text: `Xin chào! Tôi là Trợ lý AI môn **${subject.name}** (${subject.code}). Đang áp dụng ngữ cảnh tài liệu **"${currentDoc.file_name}"**. Bạn có thắc mắc gì về bài học này không?`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ]);
        }
      } catch (err) {
        console.warn('Could not load history:', err);
      } finally {
        setLoadingHistory(false);
      }
    };

    loadHistory();
  }, [currentDoc?.id, subject.name, subject.code]);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Handle Send Question
  const handleSendMessage = async (textToSend) => {
    const query = (textToSend || inputQuery).trim();
    if (!query) return;

    if (!currentDoc) {
      setErrorMsg('Vui lòng tải lên hoặc chọn một tài liệu để làm ngữ cảnh hỏi đáp.');
      return;
    }

    setErrorMsg('');
    const userMsg = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setLoading(true);

    try {
      const res = await documentService.chat(currentDoc.id, query);
      const aiReply = res.data?.answer || 'Không nhận được phản hồi từ AI.';

      const aiMsg = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: aiReply,
        sources: res.data?.sources || [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      console.error('Lỗi khi chat:', err);
      const errMsg = {
        id: `ai-err-${Date.now()}`,
        sender: 'ai',
        isError: true,
        text: `⚠️ **Lỗi:** ${err.message || 'Không thể kết nối đến AI Service local. Vui lòng kiểm tra trạng thái các dịch vụ.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errMsg]);
      if (showToast) showToast(err.message || 'Lỗi khi đặt câu hỏi cho AI.', 'error');
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const quickPrompts = [
    'Tóm tắt các khái niệm trọng tâm của bài này?',
    'Giải thích phần kiến thức phức tạp nhất kèm ví dụ?',
    'Những lỗi sai phổ biến sinh viên thường mắc phải là gì?',
    'Tổng hợp các công thức / nguyên lý cần ghi nhớ?',
  ];

  const handleClearDisplay = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: 'ai',
        text: `Đã làm mới khung trò chuyện. Tôi sẵn sàng giải đáp thắc mắc về tài liệu **${currentDoc?.file_name || subject.name}**!`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-3xl shadow-xs overflow-hidden flex flex-col h-[700px]">
      {/* Chat Header */}
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-sky-500 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                Trợ lý Gia sư AI (EduMind)
              </h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                AI local
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Hỏi đáp chuyên sâu theo ngữ cảnh giáo trình của bạn
            </p>
          </div>
        </div>

        {/* Document Selector & Clear history */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          <div className="relative">
            <select
              value={currentDoc ? currentDoc.id : ''}
              onChange={(e) => onSelectDocId(e.target.value)}
              disabled={documents.length === 0}
              className="appearance-none pl-8 pr-8 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 max-w-[200px] truncate shadow-xs cursor-pointer"
            >
              {documents.length === 0 ? (
                <option value="">Chưa có tài liệu nào</option>
              ) : (
                documents.map((d) => (
                  <option key={d.id} value={d.id}>
                    📄 {d.file_name}
                  </option>
                ))
              )}
            </select>
            <FileText className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            onClick={handleClearDisplay}
            title="Làm mới hiển thị"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {loadingHistory && (
          <div className="flex items-center justify-center py-6 gap-2 text-xs text-slate-400">
            <Clock className="w-3.5 h-3.5 animate-spin" />
            <span>Đang tải lịch sử trao đổi...</span>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-3 ${
              msg.sender === 'user' ? 'flex-row-reverse' : ''
            }`}
          >
            {/* Avatar */}
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                msg.sender === 'user'
                  ? 'bg-indigo-600 text-white'
                  : msg.isError
                  ? 'bg-rose-100 text-rose-600'
                  : 'bg-indigo-100 text-indigo-700'
              }`}
            >
              {msg.sender === 'user' ? (
                <User className="w-4 h-4" />
              ) : (
                <Bot className="w-4 h-4" />
              )}
            </div>

            {/* Bubble */}
            <div
              className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-indigo-600 text-white rounded-tr-xs shadow-xs'
                  : msg.isError
                  ? 'bg-rose-50 border border-rose-200 text-rose-800 rounded-tl-xs'
                  : 'bg-slate-100/80 text-slate-800 rounded-tl-xs border border-slate-200/60 shadow-xs'
              }`}
            >
              <div className="prose prose-sm max-w-none text-inherit">
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>
              {msg.sources?.length > 0 && (
                <details className="mt-3 border-t border-slate-200 pt-2 text-xs">
                  <summary className="cursor-pointer font-semibold text-indigo-700">
                    Nguồn tham khảo ({msg.sources.length})
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {msg.sources.map((source, index) => (
                      <li key={`${msg.id}-source-${index}`} className="rounded-lg bg-white/70 p-2 text-slate-600">
                        <p className="font-semibold">{source.file_name} · đoạn {Number(source.chunk_index) + 1}</p>
                        <p className="mt-1 whitespace-pre-wrap">{source.excerpt}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div
                className={`mt-1.5 text-[10px] ${
                  msg.sender === 'user' ? 'text-indigo-200 text-right' : 'text-slate-400'
                }`}
              >
                {msg.timestamp}
              </div>
            </div>
          </div>
        ))}

        {/* Loading Indicator */}
        {loading && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-slate-100 rounded-2xl rounded-tl-xs px-4 py-3 border border-slate-200/60 flex items-center gap-2 text-slate-500 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              <span>EduMind AI đang suy nghĩ & tra cứu tài liệu...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts */}
      <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1 flex-shrink-0">
          <Sparkles className="w-3 h-3 text-indigo-500" /> Gợi ý:
        </span>
        {quickPrompts.map((prompt, idx) => (
          <button
            key={idx}
            disabled={loading || !currentDoc}
            onClick={() => handleSendMessage(prompt)}
            className="flex-shrink-0 text-xs px-2.5 py-1 bg-white hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 border border-slate-200 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-slate-200/80 bg-white">
        {errorMsg && (
          <div className="mb-2 p-2 rounded-xl bg-rose-50 text-rose-700 text-xs flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              currentDoc
                ? `Hỏi AI về tài liệu "${currentDoc.file_name}"... (Nhấn Enter để gửi)`
                : 'Vui lòng tải lên tài liệu để bắt đầu trò chuyện...'
            }
            disabled={loading || !currentDoc}
            className="flex-1 resize-none px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50"
          />

          <button
            onClick={() => handleSendMessage()}
            disabled={loading || !inputQuery.trim() || !currentDoc}
            className="p-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-2xl shadow-sm hover:shadow transition-all disabled:opacity-50 active:scale-95"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
