const { pool } = require('../config/db');

const createQuizAttempt = async (req, res, next) => {
  try {
    const documentId = Number(req.params.id);
    const quizId = Number(req.body?.quiz_id);
    const answers = req.body?.user_answers;
    if (!Number.isSafeInteger(documentId) || documentId < 1 ||
        !Number.isSafeInteger(quizId) || quizId < 1 ||
        !answers || typeof answers !== 'object' || Array.isArray(answers) ||
        Object.entries(answers).some(([index, answer]) => (
          !/^\d+$/.test(index) || typeof answer !== 'string' || answer.length > 20
        ))) {
      return res.status(400).json({ success: false, message: 'Dữ liệu kết quả bài kiểm tra không hợp lệ.' });
    }

    const userId = req.user?.id || null;
    const quizResult = await pool.query(
      `SELECT q.quiz_data
       FROM quizzes q
       JOIN documents d ON d.id = q.document_id
       JOIN subjects s ON s.id = d.subject_id
       WHERE q.id = $1 AND d.id = $2
         AND q.user_id IS NOT DISTINCT FROM $3
         AND s.user_id IS NOT DISTINCT FROM $3`,
      [quizId, documentId, userId]
    );
    if (!quizResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bài trắc nghiệm thuộc tài khoản hiện tại.' });
    }
    const quiz = quizResult.rows[0].quiz_data;
    if (!Array.isArray(quiz) || !quiz.length || Object.keys(answers).some((index) => Number(index) >= quiz.length)) {
      return res.status(400).json({ success: false, message: 'Dữ liệu bài trắc nghiệm đã lưu không hợp lệ.' });
    }

    let score = 0;
    for (const [index, question] of quiz.entries()) {
      const correct = String(question?.answer || '').trim().toUpperCase();
      if (typeof question?.question !== 'string' || !Array.isArray(question.options) ||
          question.options.length !== 4 || !/^[A-D]$/.test(correct)) {
        return res.status(400).json({ success: false, message: `Câu hỏi ${index + 1} không hợp lệ.` });
      }
      if (String(answers[index] || '').trim().toUpperCase() === correct) score += 1;
    }

    const saved = await pool.query(
      `INSERT INTO quiz_attempts
         (quiz_id, user_id, subject_id, document_id, quiz_data, user_answers, score, total)
       SELECT q.id, $1, s.id, d.id, q.quiz_data, $5, $6, $7
       FROM quizzes q
       JOIN documents d ON d.id = q.document_id
       JOIN subjects s ON s.id = d.subject_id
       WHERE q.id = $2 AND d.id = $3
         AND q.user_id IS NOT DISTINCT FROM $4
         AND s.user_id IS NOT DISTINCT FROM $4
       RETURNING id, quiz_id, user_id, subject_id, document_id, quiz_data, user_answers, score, total, created_at`,
      [userId, quizId, documentId, userId, JSON.stringify(answers), score, quiz.length]
    );
    if (!saved.rows.length) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài liệu thuộc tài khoản hiện tại.' });
    }
    return res.status(201).json({ success: true, data: saved.rows[0] });
  } catch (error) {
    return next(error);
  }
};

const getSubjectQuizAttempts = async (req, res, next) => {
  try {
    const subjectId = Number(req.params.id);
    if (!Number.isSafeInteger(subjectId) || subjectId < 1) {
      return res.status(400).json({ success: false, message: 'ID môn học không hợp lệ.' });
    }
    const result = await pool.query(
      `SELECT a.id, a.document_id, d.file_name AS doc_name, a.quiz_data, a.user_answers,
              a.score, a.total, ROUND(a.score::numeric * 100 / NULLIF(a.total, 0))::int AS percentage, a.created_at
       FROM quiz_attempts a
       JOIN subjects s ON s.id = a.subject_id
       JOIN documents d ON d.id = a.document_id
       WHERE a.subject_id = $1 AND s.user_id IS NOT DISTINCT FROM $2
       ORDER BY a.created_at DESC
       LIMIT 100`,
      [subjectId, req.user?.id || null]
    );
    return res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    return next(error);
  }
};

const deleteSubjectQuizAttempts = async (req, res, next) => {
  try {
    const subjectId = Number(req.params.id);
    if (!Number.isSafeInteger(subjectId) || subjectId < 1) {
      return res.status(400).json({ success: false, message: 'ID môn học không hợp lệ.' });
    }
    const result = await pool.query(
      `DELETE FROM quiz_attempts a
       USING subjects s
       WHERE a.subject_id = s.id AND s.id = $1 AND s.user_id IS NOT DISTINCT FROM $2
       RETURNING a.id`,
      [subjectId, req.user?.id || null]
    );
    return res.status(200).json({ success: true, deleted_count: result.rowCount });
  } catch (error) {
    return next(error);
  }
};

module.exports = { createQuizAttempt, getSubjectQuizAttempts, deleteSubjectQuizAttempts };