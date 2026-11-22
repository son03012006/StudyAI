const express = require('express');
const router = express.Router();
const {
  getAllSubjects,
  getSubjectStats,
  createSubject,
  updateSubject,
  deleteSubject,
} = require('../controllers/subjectController');
const { requireAuth } = require('../middlewares/authMiddleware');
const { getSubjectQuizAttempts, deleteSubjectQuizAttempts } = require('../controllers/quizAttemptController');

// Lấy danh sách tất cả môn học
router.get('/', requireAuth, getAllSubjects);
router.get('/:id/stats', requireAuth, getSubjectStats);

// Thêm môn học mới
router.post('/', requireAuth, createSubject);
router.put('/:id', requireAuth, updateSubject);

// Xóa môn học theo ID
router.delete('/:id', requireAuth, deleteSubject);
router.get('/:id/quiz-attempts', requireAuth, getSubjectQuizAttempts);
router.delete('/:id/quiz-attempts', requireAuth, deleteSubjectQuizAttempts);

module.exports = router;
