const express = require('express');
const { getDashboardStats } = require('../controllers/dashboardController');
const { requireAuth } = require('../middlewares/authMiddleware');

const router = express.Router();
router.get('/stats', requireAuth, getDashboardStats);

module.exports = router;
