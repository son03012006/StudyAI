import React, { useState, useEffect } from 'react';
import {
  HelpCircle,
  Sparkles,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Trophy,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  FileText,
  AlertCircle,
  Loader2,
  Award,
  ChevronDown,
  Layers,
  History,
  BookOpen,
  Eye,
  Check,
  Calendar,
  Trash2
} from 'lucide-react';
import documentService from '../services/documentService';

export default function QuizModule({
  subject,
  documents,
  selectedDocId,
  onSelectDocId,
  showToast,
}) {
  const [activeSubTab, setActiveSubTab] = useState('quiz');

  // Quiz State
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [quizError, setQuizError] = useState('');
  const [quizList, setQuizList] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [isFinished, setIsFinished] = useState(false);
  const [quizId, setQuizId] = useState(null);
  const [savingAttempt, setSavingAttempt] = useState(false);
  const [attemptSaveFailed, setAttemptSaveFailed] = useState(false);
  const [essayQuestions, setEssayQuestions] = useState([]);
  const [essayQuizId, setEssayQuizId] = useState(null);
  const [essayAnswers, setEssayAnswers] = useState({});
  const [essayResults, setEssayResults] = useState(null);
  const [essayDifficulty, setEssayDifficulty] = useState('medium');
  const [essayError, setEssayError] = useState('');
  const [loadingEssay, setLoadingEssay] = useState(false);

  // Flashcards State
  const [loadingFlashcards, setLoadingFlashcards] = useState(false);
  const [flashcardError, setFlashcardError] = useState('');
  const [flashcards, setFlashcards] = useState([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [masteredCards, setMasteredCards] = useState({}); // { [index]: true }

  // History State
  const [historyList, setHistoryList] = useState([]);

  // Selected document info
  const currentDoc = documents.find((d) => String(d.id) === String(selectedDocId)) || documents[0];

  useEffect(() => {
    if (!selectedDocId && documents.length > 0) {
      onSelectDocId(documents[0].id);
    }
  }, [documents, selectedDocId, onSelectDocId]);

  const loadHistory = async () => {
    try {
      const response = await documentService.getQuizAttempts(subject.id);
      setHistoryList((response.data || []).map((item) => ({
        ...item,
        docName: item.doc_name,
        date: item.created_at,
      })));
    } catch (error) {
      setHistoryList([]);
      showToast?.(error.message || 'Không thể tải lịch sử bài kiểm tra.', 'error');
    }
  };

  useEffect(() => {
    loadHistory();
  }, [subject.id]);

  const saveQuizAttempt = async () => {
    try {
      if (!quizId) throw new Error('Không tìm thấy mã đề đã lưu để ghi nhận kết quả.');
      setSavingAttempt(true);
      await documentService.saveQuizAttempt(currentDoc.id, quizId, selectedAnswers);
      await loadHistory();
      return true;
    } catch (error) {
      setQuizError(error.message || 'Không thể lưu kết quả vào cơ sở dữ liệu.');
      showToast?.(error.message || 'Không thể lưu kết quả bài kiểm tra.', 'error');
      return false;
    } finally {
      setSavingAttempt(false);
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm('Bạn có chắc muốn xóa toàn bộ lịch sử thi của môn học này?')) return;
    try {
      await documentService.clearQuizAttempts(subject.id);
      setHistoryList([]);
      if (showToast) showToast('Đã xóa lịch sử luyện thi.');
    } catch (error) {
      showToast?.(error.message || 'Không thể xóa lịch sử luyện thi.', 'error');
    }
  };

  // Sinh bài trắc nghiệm
  const handleGenerateQuiz = async () => {
    if (!currentDoc) {
      setQuizError('Vui lòng chọn một tài liệu để tạo bài trắc nghiệm.');
      return;
    }

    try {
      setLoadingQuiz(true);
      setQuizError('');
      setIsFinished(false);
      setAttemptSaveFailed(false);
      setSelectedAnswers({});
      setCurrentIndex(0);

      const res = await documentService.generateQuiz(currentDoc.id);
      if (res && res.data && Array.isArray(res.data.quiz)) {
        setQuizList(res.data.quiz);
        setQuizId(res.data.quiz_id);
        if (showToast) showToast('Đã tạo thành công 5 câu hỏi ôn tập!');
      } else {
        throw new Error('Dữ liệu bài trắc nghiệm không hợp lệ.');
      }
    } catch (err) {
      console.error('Lỗi khi tạo quiz:', err);
      setQuizError(err.message || 'Không thể tạo bài trắc nghiệm với AI.');
      if (showToast) showToast(err.message || 'Lỗi khi tạo câu hỏi trắc nghiệm.', 'error');
    } finally {
      setLoadingQuiz(false);
    }
  };

  // Sinh Flashcards
  const handleGenerateFlashcards = async () => {
    if (!currentDoc) {
      setFlashcardError('Vui lòng chọn một tài liệu để tạo thẻ ghi nhớ.');
      return;
    }

    try {
      setLoadingFlashcards(true);
      setFlashcardError('');
      setCurrentCardIndex(0);
      setIsFlipped(false);
      setMasteredCards({});

      const res = await documentService.generateFlashcards(currentDoc.id);
      if (res && res.data && Array.isArray(res.data.flashcards)) {
        setFlashcards(res.data.flashcards);
        if (showToast) showToast('Đã tạo thành công bộ thẻ Flashcard!');
      } else {
        throw new Error('Dữ liệu thẻ ghi nhớ không hợp lệ.');
      }
    } catch (err) {
      console.error('Lỗi khi tạo flashcard:', err);
      setFlashcardError(err.message || 'Không thể tạo thẻ ghi nhớ với AI.');
      if (showToast) showToast(err.message || 'Lỗi khi tạo thẻ ghi nhớ.', 'error');
    } finally {
      setLoadingFlashcards(false);
    }
  };

  // Chọn đáp án
  const handleSelectOption = (optionLetter) => {
    if (selectedAnswers[currentIndex]) return;

    const nextAnswers = {
      ...selectedAnswers,
      [currentIndex]: optionLetter,
    };
    setSelectedAnswers(nextAnswers);
  };

  const calculateScore = () => {
    let correct = 0;
    quizList.forEach((q, idx) => {
      const selected = selectedAnswers[idx];
      const correctAns = (q.answer || '').trim().toUpperCase();
      if (selected === correctAns) {
        correct += 1;
      }
    });
    return correct;
  };

  const handleNextQuestion = async () => {
    if (currentIndex < quizList.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      const saved = await saveQuizAttempt();
      setAttemptSaveFailed(!saved);
      setIsFinished(true);
    }
  };

  const handleRestartQuiz = () => {
    setSelectedAnswers({});
    setCurrentIndex(0);
    setIsFinished(false);
  };

  const handleGenerateEssayQuiz = async () => {
    if (!currentDoc) {
      setEssayError('Vui lòng chọn một tài liệu để tạo câu hỏi tự luận.');
      return;
    }
    try {
      setLoadingEssay(true);
      setEssayError('');
      setEssayResults(null);
      setEssayAnswers({});
      const response = await documentService.generateEssayQuiz(currentDoc.id, 5, essayDifficulty);
      if (!Array.isArray(response.data?.questions) || !response.data?.quiz_id) {
        throw new Error('Dữ liệu câu hỏi tự luận trả về không hợp lệ.');
      }
      setEssayQuestions(response.data.questions);
      setEssayQuizId(response.data.quiz_id);
    } catch (error) {
      setEssayError(error.message || 'Không thể tạo câu hỏi tự luận.');
      showToast?.(error.message || 'Không thể tạo câu hỏi tự luận.', 'error');
    } finally {
      setLoadingEssay(false);
    }
  };

  const handleSubmitEssayQuiz = async () => {
    if (!essayQuizId) return;
    try {
      setLoadingEssay(true);
      setEssayError('');
      const response = await documentService.submitEssayQuiz(currentDoc.id, essayQuizId, essayAnswers);
      setEssayResults(response.data);
      showToast?.('Đã chấm và lưu kết quả bài tự luận.');
    } catch (error) {
      setEssayError(error.message || 'Không thể chấm bài tự luận.');
      showToast?.(error.message || 'Không thể chấm bài tự luận.', 'error');
    } finally {
      setLoadingEssay(false);
    }
  };

  const currentQuestion = quizList[currentIndex];
  const currentSelected = selectedAnswers[currentIndex];
  const isAnswered = currentSelected !== undefined;
  const isCorrect = isAnswered && currentSelected === (currentQuestion?.answer || '').trim().toUpperCase();

  const currentFlashcard = flashcards[currentCardIndex];

  return (
    <div className="bg-white border border-slate-200/90 rounded-3xl shadow-xs overflow-hidden p-6 sm:p-8">
      {/* Top Header & Sub-tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Award className="w-5 h-5" />
            </span>
            <h3 className="text-lg font-bold text-slate-900">
              Ôn tập & Luyện thi Thông minh
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Kết hợp trắc nghiệm, tự luận AI, flashcard và lịch sử ôn tập
          </p>
        </div>

        {/* Sub-tab navigation */}
        <div className="flex items-center p-1 bg-slate-100 rounded-2xl gap-1">
          <button
            onClick={() => setActiveSubTab('quiz')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === 'quiz'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Trắc nghiệm</span>
          </button>

          <button
            onClick={() => setActiveSubTab('essay')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === 'essay' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Tự luận</span>
          </button>

          <button
            onClick={() => setActiveSubTab('flashcard')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === 'flashcard'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Thẻ Flashcard</span>
          </button>

          <button
            onClick={() => setActiveSubTab('history')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === 'history'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Lịch sử ({historyList.length})</span>
          </button>
        </div>
      </div>

      {/* Global Document Selector (shared across quiz & flashcard) */}
      {activeSubTab !== 'history' && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-200/80">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600">Ngữ cảnh giáo trình:</span>
            <div className="relative">
              <select
                value={currentDoc ? currentDoc.id : ''}
                onChange={(e) => onSelectDocId(e.target.value)}
                disabled={documents.length === 0 || loadingQuiz || loadingFlashcards}
                className="appearance-none pl-8 pr-8 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 max-w-[240px] truncate shadow-xs cursor-pointer"
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
          </div>

          <div>
            {activeSubTab === 'quiz' && (
              <button
                onClick={handleGenerateQuiz}
                disabled={loadingQuiz || !currentDoc}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-semibold rounded-xl shadow-sm transition-all disabled:opacity-50"
              >
                {loadingQuiz ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>{loadingQuiz ? 'Đang soạn đề...' : 'Tạo 5 câu trắc nghiệm mới'}</span>
              </button>
            )}

            {activeSubTab === 'flashcard' && (
              <button
                onClick={handleGenerateFlashcards}
                disabled={loadingFlashcards || !currentDoc}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-semibold rounded-xl shadow-sm transition-all disabled:opacity-50"
              >
                {loadingFlashcards ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Layers className="w-4 h-4" />
                )}
                <span>{loadingFlashcards ? 'Đang trích xuất thẻ...' : 'Tạo bộ Flashcard mới'}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ================= SUB-TAB 1: TRẮC NGHIỆM (QUIZ) ================= */}
      {activeSubTab === 'quiz' && (
        <div>
          {quizError && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <div>
                <h5 className="font-bold mb-0.5">Không thể tạo trắc nghiệm</h5>
                <p>{quizError}</p>
              </div>
            </div>
          )}

          {loadingQuiz && (
            <div className="py-16 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4 ring-8 ring-indigo-50/50">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <h4 className="text-base font-bold text-slate-800 mb-1">
                AI local đang phân tích bài học và soạn 5 câu hỏi...
              </h4>
              <p className="text-xs text-slate-400 max-w-sm">
                Quá trình này chỉ mất từ 3-5 giây.
              </p>
            </div>
          )}

          {!loadingQuiz && quizList.length === 0 && !quizError && (
            <div className="py-12 text-center max-w-md mx-auto">
              <div className="w-16 h-16 rounded-3xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-4">
                <HelpCircle className="w-8 h-8" />
              </div>
              <h4 className="text-base font-bold text-slate-800 mb-1">
                Sẵn sàng kiểm tra kiến thức của bạn?
              </h4>
              <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                Nhấn nút <strong>"Tạo 5 câu trắc nghiệm mới"</strong> ở trên để AI tạo ngay bộ đề ôn thi kèm lời giải thích chi tiết.
              </p>
              <button
                onClick={handleGenerateQuiz}
                disabled={!currentDoc}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" /> Bắt đầu tạo bài trắc nghiệm
              </button>
            </div>
          )}

          {/* Finished Summary Screen */}
          {!loadingQuiz && quizList.length > 0 && isFinished && (
            <div className="py-10 text-center max-w-lg mx-auto animate-in fade-in zoom-in-95 duration-200">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-400 to-amber-500 text-white flex items-center justify-center mx-auto mb-5 shadow-lg shadow-amber-500/30">
                <Trophy className="w-10 h-10" />
              </div>

              <h4 className="text-2xl font-extrabold text-slate-900 mb-1">
                Hoàn thành bài luyện tập!
              </h4>
              <p className={`text-xs mb-6 ${attemptSaveFailed ? 'text-rose-700' : 'text-slate-500'}`}>
                {attemptSaveFailed
                  ? 'Không lưu được kết quả vào cơ sở dữ liệu. Kiểm tra thông báo lỗi và thử lại.'
                  : 'Kết quả đã được lưu vào mục Lịch sử để bạn có thể xem lại.'}
              </p>

              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 mb-6 flex items-center justify-around">
                <div>
                  <div className="text-3xl font-extrabold text-indigo-600">
                    {calculateScore()} / {quizList.length}
                  </div>
                  <div className="text-xs text-slate-500 font-semibold mt-1">
                    Số câu trả lời đúng
                  </div>
                </div>
                <div className="h-10 w-px bg-slate-200" />
                <div>
                  <div className="text-3xl font-extrabold text-emerald-600">
                    {Math.round((calculateScore() / quizList.length) * 100)}%
                  </div>
                  <div className="text-xs text-slate-500 font-semibold mt-1">
                    Tỷ lệ chính xác
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={handleRestartQuiz}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                >
                  <RotateCcw className="w-4 h-4" /> Làm lại bài này
                </button>
                <button
                  onClick={handleGenerateQuiz}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
                >
                  <RefreshCw className="w-4 h-4" /> Tạo đề thi mới
                </button>
              </div>
            </div>
          )}

          {/* Quiz In-Progress */}
          {!loadingQuiz && quizList.length > 0 && !isFinished && currentQuestion && (
            <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-150">
              <div>
                <div className="flex items-center justify-between text-xs font-bold text-slate-600 mb-2">
                  <span>Câu hỏi {currentIndex + 1} / {quizList.length}</span>
                  <span className="text-indigo-600">
                    Đã làm: {Object.keys(selectedAnswers).length}/{quizList.length}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 transition-all duration-300 rounded-full"
                    style={{
                      width: `${((currentIndex + 1) / quizList.length) * 100}%`,
                    }}
                  />
                </div>
              </div>

              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80">
                <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-indigo-100 text-indigo-700 mb-2">
                  Câu {currentIndex + 1}
                </span>
                <h4 className="text-base font-bold text-slate-900 leading-snug">
                  {currentQuestion.question}
                </h4>
              </div>

              <div className="space-y-3">
                {currentQuestion.options.map((optText, optIdx) => {
                  const letter = optText.trim().charAt(0).toUpperCase();
                  const isOptionSelected = currentSelected === letter;
                  const isCorrectAnswer = (currentQuestion.answer || '').trim().toUpperCase() === letter;

                  let buttonStyle = 'bg-white border-slate-200 text-slate-800 hover:border-indigo-300 hover:bg-indigo-50/30';
                  let badgeStyle = 'bg-slate-100 text-slate-600';

                  if (isAnswered) {
                    if (isCorrectAnswer) {
                      buttonStyle = 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold ring-1 ring-emerald-400';
                      badgeStyle = 'bg-emerald-600 text-white';
                    } else if (isOptionSelected && !isCorrect) {
                      buttonStyle = 'bg-rose-50 border-rose-300 text-rose-900 font-semibold ring-1 ring-rose-400';
                      badgeStyle = 'bg-rose-600 text-white';
                    } else {
                      buttonStyle = 'bg-slate-50 border-slate-200 text-slate-400 opacity-60';
                    }
                  }

                  return (
                    <button
                      key={optIdx}
                      onClick={() => handleSelectOption(letter)}
                      disabled={isAnswered}
                      className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between text-sm shadow-xs ${buttonStyle}`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${badgeStyle}`}
                        >
                          {letter}
                        </span>
                        <span>{optText.replace(/^[A-Da-d][.:)]\s*/, '')}</span>
                      </div>

                      {isAnswered && isCorrectAnswer && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 ml-2" />
                      )}
                      {isAnswered && isOptionSelected && !isCorrect && (
                        <XCircle className="w-5 h-5 text-rose-600 flex-shrink-0 ml-2" />
                      )}
                    </button>
                  );
                })}
              </div>

              {isAnswered && (
                <div
                  className={`p-4 rounded-2xl border text-xs leading-relaxed animate-in fade-in slide-in-from-bottom-2 duration-200 ${
                    isCorrect
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50/70 border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold mb-1">
                    {isCorrect ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-600" />
                    )}
                    <span>
                      {isCorrect ? 'Chính xác! Lời giải thích từ AI:' : 'Chưa chính xác! Đáp án đúng và lời giải thích:'}
                    </span>
                  </div>
                  <p className="text-slate-700 pl-5">
                    {currentQuestion.explanation || 'Không có giải thích chi tiết.'}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <span className="text-xs text-slate-400">
                  {isAnswered ? 'Nhấn để tiếp tục câu hỏi' : 'Vui lòng chọn 1 đáp án để xem giải thích'}
                </span>
                <button
                  onClick={handleNextQuestion}
                  disabled={!isAnswered || savingAttempt}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl shadow-sm transition-all disabled:opacity-40"
                >
                  <span>{savingAttempt ? 'Đang lưu kết quả...' : currentIndex === quizList.length - 1 ? 'Xem kết quả' : 'Câu tiếp theo'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'essay' && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-slate-50 p-4">
            <label className="space-y-1 text-xs font-semibold text-slate-700">
              Độ khó
              <select value={essayDifficulty} onChange={(event) => setEssayDifficulty(event.target.value)} className="block rounded-lg border border-slate-300 bg-white px-3 py-2">
                <option value="easy">Dễ</option>
                <option value="medium">Trung bình</option>
                <option value="hard">Khó</option>
              </select>
            </label>
            <button type="button" onClick={handleGenerateEssayQuiz} disabled={loadingEssay || !currentDoc} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
              {loadingEssay && !essayResults ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Tạo câu hỏi tự luận
            </button>
          </div>
          {essayError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{essayError}</p>}
          {essayQuestions.length > 0 && !essayResults && (
            <div className="space-y-4">
              {essayQuestions.map((question, index) => (
                <label key={`${essayQuizId}-${index}`} className="block space-y-2 rounded-2xl border border-slate-200 p-4">
                  <span className="font-semibold text-slate-800">Câu {index + 1}. {question.question}</span>
                  <span className="block text-xs text-slate-500">Độ khó: {question.difficulty || essayDifficulty}</span>
                  <textarea rows={4} maxLength={20000} value={essayAnswers[index] || ''} onChange={(event) => setEssayAnswers((current) => ({ ...current, [index]: event.target.value }))} placeholder="Nhập câu trả lời của bạn..." className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-indigo-500" />
                </label>
              ))}
              <button type="button" onClick={handleSubmitEssayQuiz} disabled={loadingEssay} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                {loadingEssay ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Chấm và lưu bài làm
              </button>
            </div>
          )}
          {essayResults && (
            <article className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
              <h4 className="text-lg font-bold text-slate-900">Kết quả: {Number(essayResults.score).toFixed(1)} / {Number(essayResults.total_score).toFixed(1)}</h4>
              {(essayResults.results || []).map((result, index) => (
                <div key={`${essayResults.id}-${index}`} className="rounded-xl bg-white p-4">
                  <p className="font-semibold text-slate-800">Câu {index + 1}: {Number(result.score).toFixed(1)} / {Number(result.maxScore).toFixed(1)}</p>
                  <p className="mt-1 text-sm text-slate-600">{result.feedback}</p>
                  {Array.isArray(result.criterionResults) && result.criterionResults.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-500">
                      {result.criterionResults.map((criterion, criterionIndex) => <li key={criterionIndex}>{criterion.criterion}: {criterion.feedback}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </article>
          )}
        </section>
      )}

      {/* ================= SUB-TAB: THẺ GHI NHỚ (FLASHCARDS) ================= */}
      {activeSubTab === 'flashcard' && (
        <div className="max-w-2xl mx-auto">
          {flashcardError && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <div>
                <h5 className="font-bold mb-0.5">Không thể tạo Flashcard</h5>
                <p>{flashcardError}</p>
              </div>
            </div>
          )}

          {loadingFlashcards && (
            <div className="py-16 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4 ring-8 ring-indigo-50/50">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <h4 className="text-base font-bold text-slate-800 mb-1">
                AI local đang tổng hợp 6 khái niệm cốt lõi thành thẻ Flashcard...
              </h4>
              <p className="text-xs text-slate-400 max-w-sm">
                Chuẩn bị sẵn sàng để ôn bài nhanh bằng phương pháp Active Recall.
              </p>
            </div>
          )}

          {!loadingFlashcards && flashcards.length === 0 && !flashcardError && (
            <div className="py-12 text-center max-w-md mx-auto">
              <div className="w-16 h-16 rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
                <Layers className="w-8 h-8" />
              </div>
              <h4 className="text-base font-bold text-slate-800 mb-1">
                Ôn bài siêu tốc với Thẻ Ghi Nhớ (Flashcards)
              </h4>
              <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                Nhấn <strong>"Tạo bộ Flashcard mới"</strong> để AI tự động trích xuất các định nghĩa, công thức quan trọng thành từng thẻ lật thông minh.
              </p>
              <button
                onClick={handleGenerateFlashcards}
                disabled={!currentDoc}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" /> Bắt đầu tạo Flashcards
              </button>
            </div>
          )}

          {/* Interactive Flashcard Card */}
          {!loadingFlashcards && flashcards.length > 0 && currentFlashcard && (
            <div className="space-y-6">
              {/* Tracker & Mastered toggle */}
              <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                <span>Thẻ {currentCardIndex + 1} / {flashcards.length}</span>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-600 font-semibold">
                    Đã thuộc: {Object.keys(masteredCards).length}/{flashcards.length}
                  </span>
                  <button
                    onClick={() =>
                      setMasteredCards((prev) => ({
                        ...prev,
                        [currentCardIndex]: !prev[currentCardIndex],
                      }))
                    }
                    className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-colors ${
                      masteredCards[currentCardIndex]
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{masteredCards[currentCardIndex] ? 'Đã nhớ' : 'Đánh dấu đã nhớ'}</span>
                  </button>
                </div>
              </div>

              {/* 3D Flip Card */}
              <div
                onClick={() => setIsFlipped(!isFlipped)}
                className="relative h-72 sm:h-80 w-full cursor-pointer select-none rounded-3xl p-8 border border-slate-200/90 shadow-md transition-all duration-300 transform hover:scale-[1.01] flex flex-col justify-between overflow-hidden bg-gradient-to-br from-white via-indigo-50/20 to-white"
              >
                {/* Top Badge */}
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                      isFlipped
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-indigo-100 text-indigo-800'
                    }`}
                  >
                    {isFlipped ? 'Mặt sau: Định nghĩa / Giải thích' : 'Mặt trước: Khái niệm / Câu hỏi'}
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" /> Nhấp vào thẻ để lật
                  </span>
                </div>

                {/* Main Card Content */}
                <div className="my-auto text-center px-4">
                  {!isFlipped ? (
                    <div>
                      <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-snug">
                        {currentFlashcard.front}
                      </h3>
                      {currentFlashcard.hint && (
                        <p className="mt-3 text-xs text-slate-400 italic">
                          💡 Gợi ý: {currentFlashcard.hint}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="animate-in fade-in duration-200">
                      <p className="text-base sm:text-lg font-medium text-slate-800 leading-relaxed">
                        {currentFlashcard.back}
                      </p>
                    </div>
                  )}
                </div>

                {/* Bottom Instruction */}
                <div className="text-center text-xs text-slate-400 pt-2 border-t border-slate-100">
                  {isFlipped ? 'Nhấp để quay lại mặt trước' : 'Nhấp để xem câu trả lời'}
                </div>
              </div>

              {/* Flashcard Navigation Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => {
                    setIsFlipped(false);
                    setCurrentCardIndex((prev) => Math.max(0, prev - 1));
                  }}
                  disabled={currentCardIndex === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Thẻ trước
                </button>

                <button
                  onClick={() => setIsFlipped(!isFlipped)}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors"
                >
                  {isFlipped ? 'Xem mặt trước' : 'Lật xem giải thích'}
                </button>

                <button
                  onClick={() => {
                    setIsFlipped(false);
                    setCurrentCardIndex((prev) => Math.min(flashcards.length - 1, prev + 1));
                  }}
                  disabled={currentCardIndex === flashcards.length - 1}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 transition-colors shadow-xs"
                >
                  Thẻ tiếp <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= SUB-TAB 3: LỊCH SỬ BÀI THI (HISTORY) ================= */}
      {activeSubTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-800">
              Lịch sử các lần làm trắc nghiệm ({historyList.length})
            </h4>
            {historyList.length > 0 && (
              <button
                onClick={handleClearHistory}
                className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 font-semibold p-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> Xóa lịch sử
              </button>
            )}
          </div>

          {historyList.length === 0 ? (
            <div className="py-12 text-center bg-slate-50 rounded-2xl border border-slate-200/80">
              <History className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">
                Chưa có lịch sử làm bài trắc nghiệm nào
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Hãy chuyển sang tab "Trắc nghiệm" và hoàn thành bài thi đầu tiên để ghi lại điểm số!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {historyList.map((item) => (
                <div
                  key={item.id}
                  className="p-4 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-200/80 transition-colors flex items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-slate-900 truncate">
                        📄 {item.docName}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          item.percentage >= 80
                            ? 'bg-emerald-100 text-emerald-800'
                            : item.percentage >= 50
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {item.percentage}%
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(item.date).toLocaleDateString('vi-VN')} {new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-extrabold text-indigo-600">
                      {item.score} / {item.total}
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium">câu đúng</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
