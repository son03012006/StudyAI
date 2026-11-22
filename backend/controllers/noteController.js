const { pool } = require('../config/db');

const listNotes = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT n.id, n.subject_id, n.title, n.content, n.created_at, n.updated_at,
              s.name AS subject_name, s.code AS subject_code
       FROM notes n
       LEFT JOIN subjects s ON s.id = n.subject_id
       WHERE n.user_id = $1
       ORDER BY n.updated_at DESC, n.id DESC`,
      [req.user.id]
    );
    return res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    return next(error);
  }
};

const createNote = async (req, res, next) => {
  try {
    const { title, content = '', subject_id: subjectId = null } = req.body;
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 200 ||
        typeof content !== 'string' || content.length > 50000) {
      return res.status(400).json({ success: false, message: 'Tiêu đề hoặc nội dung ghi chú không hợp lệ.' });
    }

    let cleanSubjectId = null;
    if (subjectId !== null && subjectId !== '') {
      cleanSubjectId = Number(subjectId);
      if (!Number.isInteger(cleanSubjectId) || cleanSubjectId < 1) {
        return res.status(400).json({ success: false, message: 'Môn học không hợp lệ.' });
      }
      const subject = await pool.query(
        'SELECT id FROM subjects WHERE id = $1 AND user_id = $2',
        [cleanSubjectId, req.user.id]
      );
      if (!subject.rows.length) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy môn học thuộc tài khoản hiện tại.' });
      }
    }

    const result = await pool.query(
      `INSERT INTO notes (user_id, subject_id, title, content)
       VALUES ($1, $2, $3, $4)
       RETURNING id, subject_id, title, content, created_at, updated_at`,
      [req.user.id, cleanSubjectId, title.trim(), content]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    return next(error);
  }
};

const updateNote = async (req, res, next) => {
  try {
    const noteId = Number(req.params.id);
    const { title, content, subject_id: subjectId = null } = req.body;
    if (!Number.isInteger(noteId) || noteId < 1 ||
        typeof title !== 'string' || !title.trim() || title.trim().length > 200 ||
        typeof content !== 'string' || content.length > 50000) {
      return res.status(400).json({ success: false, message: 'ID, tiêu đề hoặc nội dung ghi chú không hợp lệ.' });
    }

    let cleanSubjectId = null;
    if (subjectId !== null && subjectId !== '') {
      cleanSubjectId = Number(subjectId);
      if (!Number.isInteger(cleanSubjectId) || cleanSubjectId < 1) {
        return res.status(400).json({ success: false, message: 'Môn học không hợp lệ.' });
      }
      const subject = await pool.query(
        'SELECT id FROM subjects WHERE id = $1 AND user_id = $2',
        [cleanSubjectId, req.user.id]
      );
      if (!subject.rows.length) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy môn học thuộc tài khoản hiện tại.' });
      }
    }

    const result = await pool.query(
      `UPDATE notes SET subject_id = $1, title = $2, content = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND user_id = $5
       RETURNING id, subject_id, title, content, created_at, updated_at`,
      [cleanSubjectId, title.trim(), content, noteId, req.user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy ghi chú.' });
    }
    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    return next(error);
  }
};

const deleteNote = async (req, res, next) => {
  try {
    const noteId = Number(req.params.id);
    if (!Number.isInteger(noteId) || noteId < 1) {
      return res.status(400).json({ success: false, message: 'ID ghi chú không hợp lệ.' });
    }
    const result = await pool.query(
      'DELETE FROM notes WHERE id = $1 AND user_id = $2 RETURNING id',
      [noteId, req.user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy ghi chú.' });
    }
    return res.status(200).json({ success: true, data: { id: result.rows[0].id } });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listNotes, createNote, updateNote, deleteNote };
