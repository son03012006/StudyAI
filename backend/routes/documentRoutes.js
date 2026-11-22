const express = require('express');
const router = express.Router();
const {
  upload,
  uploadDocument,
  getDocumentsBySubject,
  summarizeDocument,
  getDocumentSummaries,
  chatWithDocument,
  getChatHistory,
  generateQuizFromDocument,
  generateEssayQuizFromDocument,
  submitEssayQuiz,
  generateFlashcardsFromDocument,
  deleteDocument,
} = require('../controllers/documentController');
const { createQuizAttempt } = require('../controllers/quizAttemptController');
const { requireAuth } = require('../middlewares/authMiddleware');

// Upload tài liệu mới
router.post('/upload', requireAuth, upload.single('file'), uploadDocument);

// Lấy danh sách tài liệu của một môn học
router.get('/subject/:subjectId', requireAuth, getDocumentsBySubject);

// Tóm tắt tài liệu bằng Ollama local
router.post('/:id/summarize', requireAuth, summarizeDocument);
router.get('/:id/summaries', requireAuth, getDocumentSummaries);

// Đặt câu hỏi theo ngữ cảnh tài liệu
router.post('/:id/chat', requireAuth, chatWithDocument);

// Lấy lịch sử hỏi đáp của tài liệu
router.get('/:id/history', requireAuth, getChatHistory);

// Sinh bài trắc nghiệm từ tài liệu
router.post('/:id/quiz', requireAuth, generateQuizFromDocument);
router.post('/:id/quiz-attempts', requireAuth, createQuizAttempt);
router.post('/:id/essay-quiz', requireAuth, generateEssayQuizFromDocument);
router.post('/:id/essay-quiz/:quizId/submit', requireAuth, submitEssayQuiz);

// Sinh thẻ ghi nhớ (Flashcards) từ tài liệu
router.post('/:id/flashcards', requireAuth, generateFlashcardsFromDocument);

// Xóa tài liệu
router.delete('/:id', requireAuth, deleteDocument);

module.exports = router;
