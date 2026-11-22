const multer = require('multer');

/**
 * Middleware xử lý lỗi tập trung cho toàn bộ ứng dụng
 * Hỗ trợ: Multer, local AI services, PostgreSQL, lỗi chung
 */
const errorHandler = (err, req, res, next) => {
  console.error('[Error Middleware]:', err.message || err);

  // 1. Xử lý lỗi từ Multer (Upload file)
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Dung lượng file vượt quá giới hạn 50MB. Vui lòng chọn file nhỏ hơn.',
        code: 'FILE_TOO_LARGE',
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Trường tải file không đúng quy cách.',
        code: 'UNEXPECTED_FILE_FIELD',
      });
    }
    return res.status(400).json({
      success: false,
      message: `Lỗi tải file: ${err.message}`,
      code: err.code,
    });
  }

  const errMsg = (err.message || '').toLowerCase();

  if (errMsg.includes('python ai service timeout')) {
    return res.status(504).json({
      success: false,
      message: err.message,
      code: 'AI_SERVICE_TIMEOUT',
    });
  }

  if (errMsg.includes('python ai service')) {
    return res.status(503).json({
      success: false,
      message: `${err.message} Kiểm tra AI_SERVICE_URL và trạng thái Python AI Service.`,
      code: 'AI_SERVICE_UNAVAILABLE',
    });
  }

  // 2. Lỗi định dạng file không được phép
  if (err.message && err.message.includes('Chỉ hỗ trợ tải lên file')) {
    return res.status(400).json({
      success: false,
      message: err.message,
      code: 'INVALID_FILE_TYPE',
    });
  }

  // 3. Lỗi Ollama AI — không kết nối được
  if (
    errMsg.includes('econnrefused') ||
    errMsg.includes('không thể kết nối đến ollama') ||
    errMsg.includes('ollama timeout') ||
    errMsg.includes('ollama lỗi')
  ) {
    return res.status(503).json({
      success: false,
      message:
        'Dịch vụ AI (Ollama) hiện chưa hoạt động. ' +
        'Vui lòng:\n1. Cài Ollama: https://ollama.com/download\n' +
        `2. Chạy: ollama serve\n3. Tải model: ollama pull ${process.env.OLLAMA_MODEL || 'qwen2.5:3b'}`,
      code: 'OLLAMA_NOT_RUNNING',
      fix: {
        install: 'https://ollama.com/download',
        run_server: 'ollama serve',
        pull_model: `ollama pull ${process.env.OLLAMA_MODEL || 'qwen2.5:3b'}`,
        check_status: 'http://localhost:5000/api/health/ai',
      },
    });
  }

  // 4. Lỗi Ollama timeout
  if (errMsg.includes('timeout') && errMsg.includes('ollama')) {
    return res.status(504).json({
      success: false,
      message:
        `AI đang xử lý quá lâu (timeout). ` +
        `Model "${process.env.OLLAMA_MODEL || 'qwen2.5:3b'}" có thể đang tải lần đầu hoặc máy không đủ RAM. ` +
        'Thử lại sau 1-2 phút hoặc dùng model nhẹ hơn: ollama pull qwen2.5:1.5b',
      code: 'AI_TIMEOUT',
    });
  }

  // 6. Lỗi kết nối PostgreSQL
  if (err.code && (err.code.startsWith('28') || err.code.startsWith('08') || err.code === 'ECONNREFUSED')) {
    return res.status(500).json({
      success: false,
      message: 'Không thể kết nối đến cơ sở dữ liệu PostgreSQL. Vui lòng kiểm tra dịch vụ database.',
      code: 'DATABASE_CONNECTION_ERROR',
    });
  }

  // 7. Lỗi statusCode tùy chỉnh từ controller
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: 'CUSTOM_ERROR',
    });
  }

  // 8. Lỗi mặc định (Internal Server Error)
  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  return res.status(statusCode).json({
    success: false,
    message: err.message || 'Đã xảy ra lỗi nội bộ máy chủ.',
    code: 'INTERNAL_SERVER_ERROR',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};

module.exports = errorHandler;
