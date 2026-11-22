const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { initDatabase } = require('./config/initDb');
const subjectRoutes = require('./routes/subjectRoutes');
const documentRoutes = require('./routes/documentRoutes');
const authRoutes = require('./routes/authRoutes');
const aiRoutes = require('./routes/aiRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const noteRoutes = require('./routes/noteRoutes');
const errorHandler = require('./middlewares/errorHandler');
const {
  checkAiHealth,
  checkOllamaHealth,
  OLLAMA_MODEL,
  OLLAMA_BASE_URL,
  AI_SERVICE_URL,
} = require('./services/aiService');

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files for uploaded documents
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check endpoint (backend)
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'StudyAI Backend API',
    timestamp: new Date().toISOString(),
    node_version: process.version,
  });
});

// Health check endpoint (Ollama AI status)
app.get('/api/health/ai', async (req, res) => {
  try {
    const health = await checkAiHealth();
    const { ollamaRunning: running, models } = health;
    const modelLoaded = models.some((m) => m.startsWith(OLLAMA_MODEL.split(':')[0]));

    res.status(health.aiServiceEnabled ? (health.aiServiceReady ? 200 : 503) : (running ? 200 : 503)).json({
      ollama_running: running,
      ollama_url: OLLAMA_BASE_URL,
      configured_model: OLLAMA_MODEL,
      model_available: modelLoaded,
      available_models: models,
      ai_service_url: AI_SERVICE_URL || null,
      ai_service_enabled: health.aiServiceEnabled,
      ai_service_running: health.aiServiceRunning,
      ai_service_ready: health.aiServiceReady,
      ai_service_status: health.aiServiceStatus,
      answer_mode: health.answerMode,
      qa_checkpoint_available: health.qaCheckpointAvailable,
      embedding_model_loaded: health.embeddingModelLoaded,
      install_guide: running
        ? null
        : {
            step1: 'Tải Ollama tại: https://ollama.com/download',
            step2: 'Chạy: ollama serve',
            step3: `Tải model: ollama pull ${OLLAMA_MODEL}`,
          },
    });
  } catch (err) {
    res.status(503).json({ ollama_running: false, error: err.message });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notes', noteRoutes);

// 404 Route Handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `API Route không tồn tại: ${req.method} ${req.originalUrl}`,
  });
});

// Global Error Handler Middleware
app.use(errorHandler);

// Start Server & Initialize Database
const startServer = async () => {
  try {
    // Tự động khởi tạo cấu trúc bảng CSDL
    await initDatabase();

    app.listen(PORT, async () => {
      console.log('===============================================');
      console.log(`🚀 StudyAI Backend Server is running on port ${PORT}`);
      console.log(`👉 API Base URL: http://localhost:${PORT}/api`);
      console.log(`👉 Auth API:     http://localhost:${PORT}/api/auth`);
      console.log(`👉 AI Helper:    http://localhost:${PORT}/api/ai`);
      console.log(`👉 AI Status:    http://localhost:${PORT}/api/health/ai`);
      console.log('-----------------------------------------------');

      // Kiểm tra Ollama khi khởi động
      const { running, models } = await checkOllamaHealth();
      if (running) {
        const modelLoaded = models.some((m) => m.startsWith(OLLAMA_MODEL.split(':')[0]));
        console.log(`✅ Ollama: đang chạy tại ${OLLAMA_BASE_URL}`);
        console.log(`🤖 Model "${OLLAMA_MODEL}": ${modelLoaded ? '✅ Đã tải sẵn' : '⚠️  Chưa tải — chạy: ollama pull ' + OLLAMA_MODEL}`);
      } else {
        console.log(`⚠️  Ollama: CHƯA CHẠY — tính năng AI sẽ không hoạt động`);
        console.log(`   → Cài Ollama: https://ollama.com/download`);
        console.log(`   → Chạy: ollama serve`);
        console.log(`   → Tải model: ollama pull ${OLLAMA_MODEL}`);
      }
      console.log('===============================================');
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();
