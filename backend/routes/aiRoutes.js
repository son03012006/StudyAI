const express = require('express');
const router = express.Router();
const {
  handleExplain,
  handleSolveExercise,
  handleCreateStudyPlan,
  handleGetStudyPlans,
  handleUpdatePlanTask,
  handleDeleteStudyPlan,
} = require('../controllers/aiController');
const { optionalAuth, requireAuth } = require('../middlewares/authMiddleware');

// Giải thích kiến thức theo mức độ
router.post('/explain', optionalAuth, handleExplain);

// Hỗ trợ giải bài tập từng bước
router.post('/solve-exercise', optionalAuth, handleSolveExercise);

// Kế hoạch học tập
router.post('/study-plan', requireAuth, handleCreateStudyPlan);
router.get('/study-plans', requireAuth, handleGetStudyPlans);
router.patch('/study-plans/:id/tasks/:dayIndex/:taskIndex', requireAuth, handleUpdatePlanTask);
router.delete('/study-plans/:id', requireAuth, handleDeleteStudyPlan);

module.exports = router;
