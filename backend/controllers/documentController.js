const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { pool } = require('../config/db');
const {
  extractTextFromPDF,
  extractTextFromDOCX,
  summarizeText,
  answerWithContext,
  createEmbeddings,
  ocrPDF,
  generateQuiz,
  generateEssayQuiz,
  gradeEssayAnswer,
  generateFlashcards,
} = require('../services/aiService');

// Đảm bảo thư mục uploads tồn tại
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Cấu hình Multer lưu file
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_\u00C0-\u1EF9]/g, '_');
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e5)}`;
    cb(null, `${baseName}-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.pdf', '.txt', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext) || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Chỉ hỗ trợ tải lên file PDF hoặc văn bản (.pdf, .txt, .docx).'));
    }
  },
});

const splitIntoChunks = (text, maxLength = 1200, overlap = 180) => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const chunks = [];
  for (let start = 0; start < normalized.length; start += maxLength - overlap) {
    const chunk = normalized.slice(start, start + maxLength).trim();
    if (chunk) chunks.push(chunk);
  }
  return chunks;
};

const cosineSimilarity = (left, right) => {
  if (!Array.isArray(left) || left.length !== right.length) return -1;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  return leftNorm && rightNorm ? dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)) : -1;
};

const indexDocument = async (documentId, text) => {
  const chunks = splitIntoChunks(text);
  if (!chunks.length) return 0;
  if (chunks.length > 500) {
    throw new Error('Tài liệu vượt quá giới hạn 500 đoạn để lập chỉ mục cục bộ.');
  }
  const vectors = await createEmbeddings(chunks);
  const modelName = process.env.AI_EMBEDDING_MODEL || 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM document_chunks WHERE document_id = $1', [documentId]);
    for (let offset = 0; offset < chunks.length; offset += 1) {
      await client.query(
        `INSERT INTO document_chunks (document_id, chunk_index, content, embedding, model_name)
         VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [documentId, offset, chunks[offset], JSON.stringify(vectors[offset]), modelName]
      );
    }
    await client.query('COMMIT');
    return chunks.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const retrieveDocumentContext = async (documentId, question, text) => {
  const modelName = process.env.AI_EMBEDDING_MODEL || 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2';
  let stored = await pool.query(
    `SELECT chunk_index, content, embedding
     FROM document_chunks
     WHERE document_id = $1 AND model_name = $2
     ORDER BY chunk_index`,
    [documentId, modelName]
  );
  if (!stored.rows.length && text.trim()) {
    await indexDocument(documentId, text);
    stored = await pool.query(
      `SELECT chunk_index, content, embedding
       FROM document_chunks
       WHERE document_id = $1 AND model_name = $2
       ORDER BY chunk_index`,
      [documentId, modelName]
    );
  }
  if (!stored.rows.length) return [];
  const [queryVector] = await createEmbeddings([question]);
  return stored.rows
    .map((row) => ({
      ...row,
      similarity: cosineSimilarity(queryVector, typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding),
    }))
    .filter((row) => row.similarity >= 0.25)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, 5);
};

/**
 * Upload tài liệu và trích xuất nội dung
 * POST /api/documents/upload
 */
const uploadDocument = async (req, res, next) => {
  try {
    const { subject_id } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn file tài liệu để tải lên.',
      });
    }

    const subjectId = Number(subject_id);
    if (!Number.isSafeInteger(subjectId) || subjectId < 1) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(400).json({
        success: false,
        message: 'Mã ID môn học (subject_id) không hợp lệ.',
      });
    }

    // Kiểm tra môn học có tồn tại
    const subjectCheck = await pool.query(
      'SELECT id, name FROM subjects WHERE id = $1 AND user_id = $2',
      [subjectId, req.user.id]
    );
    if (subjectCheck.rows.length === 0) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(404).json({
        success: false,
        message: 'Môn học không tồn tại.',
      });
    }

    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    let extractedText = '';

    const extension = path.extname(file.path).toLowerCase();
    if (extension === '.pdf') {
      extractedText = await extractTextFromPDF(file.path);
      if (extractedText.replace(/\s/g, '').length < 30) {
        const ocrResult = await ocrPDF(file.path);
        extractedText = ocrResult.text;
      }
    } else if (extension === '.docx') {
      extractedText = await extractTextFromDOCX(file.path);
    } else if (extension === '.txt') {
      extractedText = fs.readFileSync(file.path, 'utf8').replace(/^\uFEFF/, '');
    }

    if (!extractedText.trim()) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(422).json({
        success: false,
        message: 'Tài liệu không chứa văn bản có thể đọc được.',
      });
    }
    if (splitIntoChunks(extractedText).length > 500) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(413).json({
        success: false,
        message: 'Tài liệu vượt quá giới hạn lập chỉ mục 500 đoạn; hãy chia nhỏ tài liệu trước khi tải lên.',
      });
    }

    // Lưu thông tin vào CSDL
    const insertResult = await pool.query(
      `INSERT INTO documents (subject_id, file_name, file_path, file_size, content)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, subject_id, file_name, file_path, file_size, created_at,
                 LENGTH(COALESCE(content, '')) AS content_length`,
      [subjectId, originalName, file.path, file.size, extractedText]
    );

    let indexedChunkCount = 0;
    let indexingWarning = null;
    try {
      indexedChunkCount = await indexDocument(insertResult.rows[0].id, extractedText);
    } catch (indexError) {
      indexingWarning = `Tài liệu đã lưu nhưng chưa lập chỉ mục RAG: ${indexError.message}`;
      console.error('[Document indexing error]:', indexError.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Tải lên tài liệu thành công!',
      data: { ...insertResult.rows[0], indexed_chunk_count: indexedChunkCount, indexing_warning: indexingWarning },
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('[Upload cleanup error]:', cleanupError.message);
      }
    }
    next(error);
  }
};

/**
 * Lấy danh sách tài liệu theo môn học
 * GET /api/documents/subject/:subjectId
 */
const getDocumentsBySubject = async (req, res, next) => {
  try {
    const { subjectId } = req.params;

    if (!subjectId || isNaN(parseInt(subjectId, 10))) {
      return res.status(400).json({
        success: false,
        message: 'ID môn học không hợp lệ.',
      });
    }

    const result = await pool.query(
      `SELECT d.id, d.subject_id, d.file_name, d.file_size, d.created_at,
              LENGTH(COALESCE(d.content, '')) AS content_length
       FROM documents d
       JOIN subjects s ON s.id = d.subject_id
       WHERE d.subject_id = $1 AND s.user_id = $2
       ORDER BY d.created_at DESC`,
      [subjectId, req.user.id]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Trợ giúp lấy nội dung văn bản của tài liệu
 */
const getDocumentContent = async (documentId, userId) => {
  const result = await pool.query(
    `SELECT d.id, d.subject_id, d.file_name, d.file_path, d.content
     FROM documents d
     JOIN subjects s ON s.id = d.subject_id
     WHERE d.id = $1 AND s.user_id = $2`,
    [documentId, userId]
  );

  if (result.rows.length === 0) {
    const error = new Error(`Không tìm thấy tài liệu với ID = ${documentId}`);
    error.statusCode = 404;
    throw error;
  }

  const doc = result.rows[0];
  let text = doc.content;

  if (!text || text.trim().length === 0) {
    if (fs.existsSync(doc.file_path) && path.extname(doc.file_path).toLowerCase() === '.pdf') {
      text = await extractTextFromPDF(doc.file_path);
      if (text.replace(/\s/g, '').length < 30) text = (await ocrPDF(doc.file_path)).text;
      await pool.query('UPDATE documents SET content = $1 WHERE id = $2', [text, doc.id]);
    } else if (fs.existsSync(doc.file_path) && path.extname(doc.file_path).toLowerCase() === '.docx') {
      text = await extractTextFromDOCX(doc.file_path);
      await pool.query('UPDATE documents SET content = $1 WHERE id = $2', [text, doc.id]);
    } else if (fs.existsSync(doc.file_path)) {
      text = fs.readFileSync(doc.file_path, 'utf8');
      await pool.query('UPDATE documents SET content = $1 WHERE id = $2', [text, doc.id]);
    }
  }

  return { doc, text: text || '' };
};

/**
 * Tóm tắt tài liệu bằng mô hình AI local
 * POST /api/documents/:id/summarize
 */
const summarizeDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { doc, text } = await getDocumentContent(id, req.user.id);

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'File PDF này không có nội dung chữ hoặc là file scan hình ảnh chưa qua OCR.',
      });
    }

    const summary = await summarizeText(text);
    await pool.query(
      `INSERT INTO document_summaries (document_id, summary, model_name)
       VALUES ($1, $2, $3)`,
      [doc.id, summary, process.env.OLLAMA_MODEL || 'qwen2.5:3b']
    );

    return res.status(200).json({
      success: true,
      message: 'Tóm tắt tài liệu thành công!',
      data: {
        document_id: doc.id,
        file_name: doc.file_name,
        summary,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getDocumentSummaries = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT ds.id, ds.document_id, ds.summary, ds.model_name, ds.created_at
       FROM document_summaries ds
       JOIN documents d ON d.id = ds.document_id
       JOIN subjects s ON s.id = d.subject_id
       WHERE ds.document_id = $1 AND s.user_id = $2
       ORDER BY ds.created_at DESC`,
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) {
      const ownerCheck = await pool.query(
        `SELECT 1 FROM documents d JOIN subjects s ON s.id = d.subject_id
         WHERE d.id = $1 AND s.user_id = $2`,
        [req.params.id, req.user.id]
      );
      if (!ownerCheck.rows.length) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy tài liệu.' });
      }
    }
    return res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    return next(error);
  }
};

/**
 * Hỏi đáp AI theo ngữ cảnh tài liệu
 * POST /api/documents/:id/chat
 */
const chatWithDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { question } = req.body;

    if (typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập câu hỏi của bạn.',
      });
    }

    const { doc, text } = await getDocumentContent(id, req.user.id);
    const matches = await retrieveDocumentContext(doc.id, question.trim(), text);
    const ragContext = matches.map((item, index) =>
      `[Đoạn ${index + 1}] (chunk ${item.chunk_index + 1})\n${item.content}`
    ).join('\n\n');
    const aiAnswer = matches.length ? await answerWithContext(question.trim(), ragContext) : null;
    const answer = aiAnswer?.answer || 'Tôi không tìm thấy nội dung liên quan trong tài liệu này để trả lời.';
    const sources = matches.map((item, index) => ({
      citation: index + 1,
      chunk_index: item.chunk_index,
      similarity: Number(item.similarity.toFixed(4)),
      excerpt: item.content,
      file_name: doc.file_name,
    }));

    const historyResult = await pool.query(
      `INSERT INTO chat_histories (subject_id, document_id, question, answer, sources)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, subject_id, document_id, question, answer, sources, created_at`,
      [doc.subject_id, doc.id, question.trim(), answer, JSON.stringify(sources)]
    );

    return res.status(200).json({
      success: true,
      data: {
        ...historyResult.rows[0],
        model_mode: aiAnswer?.model_mode || 'no_relevant_context',
        model: aiAnswer?.model || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy toàn bộ lịch sử hỏi đáp của tài liệu
 * GET /api/documents/:id/history
 */
const getChatHistory = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id, 10))) {
      return res.status(400).json({
        success: false,
        message: 'ID tài liệu không hợp lệ.',
      });
    }

    const result = await pool.query(
      `SELECT h.id, h.subject_id, h.document_id, h.question, h.answer, h.sources, h.created_at
       FROM chat_histories h
       JOIN documents d ON d.id = h.document_id
       JOIN subjects s ON s.id = d.subject_id
       WHERE h.document_id = $1 AND s.user_id = $2
       ORDER BY h.created_at ASC`,
      [id, req.user.id]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Sinh bài trắc nghiệm từ tài liệu
 * POST /api/documents/:id/quiz
 */
const generateQuizFromDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { doc, text } = await getDocumentContent(id, req.user.id);

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Tài liệu không có nội dung chữ để tạo bài trắc nghiệm.',
      });
    }

    const quiz = await generateQuiz(text);
    const savedQuiz = await pool.query(
      `INSERT INTO quizzes (user_id, subject_id, document_id, quiz_data, model_name)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING id, created_at`,
      [req.user.id, doc.subject_id, doc.id, JSON.stringify(quiz), process.env.OLLAMA_MODEL || 'qwen2.5:3b']
    );

    return res.status(200).json({
      success: true,
      message: 'Tạo bài trắc nghiệm thành công!',
      data: {
        document_id: doc.id,
        file_name: doc.file_name,
        quiz,
        quiz_id: savedQuiz.rows[0].id,
        created_at: savedQuiz.rows[0].created_at,
      },
    });
  } catch (error) {
    next(error);
  }
};

const generateEssayQuizFromDocument = async (req, res, next) => {
  try {
    const { doc, text } = await getDocumentContent(req.params.id, req.user.id);
    if (!text.trim()) return res.status(422).json({ success: false, message: 'Tài liệu không có nội dung để tạo câu hỏi.' });
    const count = Math.min(10, Math.max(1, Number(req.body?.count) || 5));
    const difficultyMap = { easy: 'dễ', medium: 'trung bình', hard: 'khó' };
    const difficulty = difficultyMap[req.body?.difficulty] || (
      ['dễ', 'trung bình', 'khó'].includes(req.body?.difficulty) ? req.body.difficulty : 'trung bình'
    );
    const questions = await generateEssayQuiz(text, count, difficulty);
    const result = await pool.query(
      `INSERT INTO essay_quizzes (user_id, subject_id, document_id, quiz_data, model_name)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING id, created_at`,
      [req.user.id, doc.subject_id, doc.id, JSON.stringify(questions), process.env.OLLAMA_MODEL || 'qwen2.5:3b']
    );
    const visibleQuestions = questions.map(({ question, difficulty: questionDifficulty }) => ({
      question,
      difficulty: questionDifficulty || difficulty,
    }));
    return res.status(201).json({
      success: true,
      data: { quiz_id: result.rows[0].id, document_id: doc.id, questions: visibleQuestions, created_at: result.rows[0].created_at },
    });
  } catch (error) {
    return next(error);
  }
};

const submitEssayQuiz = async (req, res, next) => {
  try {
    const quizId = Number(req.params.quizId);
    const answers = req.body?.user_answers || req.body?.answers;
    if (!Number.isSafeInteger(quizId) || quizId < 1 || !answers || typeof answers !== 'object' ||
        Array.isArray(answers) || Object.entries(answers).some(([index, answer]) => (
          !/^\d+$/.test(index) || typeof answer !== 'string' || answer.length > 20000
        ))) {
      return res.status(400).json({ success: false, message: 'Dữ liệu bài tự luận không hợp lệ.' });
    }
    const quizResult = await pool.query(
      `SELECT eq.quiz_data
       FROM essay_quizzes eq
       JOIN documents d ON d.id = eq.document_id
       JOIN subjects s ON s.id = d.subject_id
       WHERE eq.id = $1 AND eq.user_id = $2 AND s.user_id = $2`,
      [quizId, req.user.id]
    );
    if (!quizResult.rows.length) return res.status(404).json({ success: false, message: 'Không tìm thấy bài tự luận.' });
    const questions = quizResult.rows[0].quiz_data;
    if (!Array.isArray(questions) || !questions.length ||
        Object.keys(answers).some((index) => Number(index) >= questions.length)) {
      return res.status(400).json({ success: false, message: 'Cấu trúc đề tự luận không hợp lệ.' });
    }
    const results = [];
    for (const [index, question] of questions.entries()) {
      if (!(answers[index] || '').trim()) {
        results.push({
          question_index: index,
          score: 0,
          maxScore: 10,
          feedback: 'Chưa nhập câu trả lời.',
          criterionResults: [],
        });
        continue;
      }
      const result = await gradeEssayAnswer({
        question: question.question,
        referenceAnswer: question.referenceAnswer,
        rubric: question.rubric,
        answer: answers[index] || '',
      });
      results.push({ question_index: index, ...result });
    }
    const score = results.reduce((sum, item) => sum + Number(item.score), 0);
    const totalScore = results.reduce((sum, item) => sum + Number(item.maxScore), 0);
    const saved = await pool.query(
      `INSERT INTO essay_quiz_attempts (quiz_id, user_id, user_answers, results, score, total_score)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)
       RETURNING id, quiz_id, user_id, user_answers, results, score, total_score, created_at`,
      [quizId, req.user.id, JSON.stringify(answers), JSON.stringify(results), score, totalScore]
    );
    return res.status(201).json({ success: true, data: saved.rows[0] });
  } catch (error) {
    return next(error);
  }
};

/**
 * Sinh thẻ ghi nhớ (Flashcards) từ tài liệu
 * POST /api/documents/:id/flashcards
 */
const generateFlashcardsFromDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { doc, text } = await getDocumentContent(id, req.user.id);

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Tài liệu không có nội dung chữ để tạo thẻ ghi nhớ.',
      });
    }

    const flashcards = await generateFlashcards(text);

    return res.status(200).json({
      success: true,
      message: 'Tạo thẻ ghi nhớ thành công!',
      data: {
        document_id: doc.id,
        file_name: doc.file_name,
        flashcards,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Xóa tài liệu
 * DELETE /api/documents/:id
 */
const deleteDocument = async (req, res, next) => {
  try {
    const { id } = req.params;

    const findResult = await pool.query(
      `SELECT d.id, d.file_path, d.file_name
       FROM documents d JOIN subjects s ON s.id = d.subject_id
       WHERE d.id = $1 AND s.user_id = $2`,
      [id, req.user.id]
    );
    if (findResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Không tìm thấy tài liệu với ID = ${id}`,
      });
    }

    const doc = findResult.rows[0];

    await pool.query('DELETE FROM documents WHERE id = $1', [id]);

    if (doc.file_path && fs.existsSync(doc.file_path)) {
      try {
        fs.unlinkSync(doc.file_path);
      } catch (err) {
        console.warn('Error deleting physical file:', err.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Đã xóa tài liệu "${doc.file_name}".`,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
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
};
