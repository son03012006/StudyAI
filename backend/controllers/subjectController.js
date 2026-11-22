const { pool } = require('../config/db');

/**
 * Lấy danh sách môn học
 * GET /api/subjects
 * Trả về môn học thuộc tài khoản đã xác thực.
 */
const getAllSubjects = async (req, res) => {
  try {
    const userId = req.user?.id || null;

    let queryText;
    let queryParams;

    if (userId) {
      // Người dùng đã đăng nhập → lấy môn học của họ
      queryText = `
        SELECT s.id, s.code, s.name, s.user_id, s.created_at,
               COUNT(d.id)::int AS document_count
        FROM subjects s
        LEFT JOIN documents d ON s.id = d.subject_id
        WHERE s.user_id = $1
        GROUP BY s.id
        ORDER BY s.created_at DESC
      `;
      queryParams = [userId];
    } else {
      // Guest → lấy môn học không gắn user (công khai)
      queryText = `
        SELECT s.id, s.code, s.name, s.user_id, s.created_at,
               COUNT(d.id)::int AS document_count
        FROM subjects s
        LEFT JOIN documents d ON s.id = d.subject_id
        WHERE s.user_id IS NULL
        GROUP BY s.id
        ORDER BY s.created_at DESC
      `;
      queryParams = [];
    }

    const result = await pool.query(queryText, queryParams);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error('[Subject] Error fetching subjects:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi lấy danh sách môn học.',
    });
  }
};

/**
 * Thêm môn học mới
 * POST /api/subjects
 * Body: { code, name }
 */
const createSubject = async (req, res) => {
  try {
    const { code, name } = req.body;
    const userId = req.user?.id || null;

    if (!code || !name || !code.trim() || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Mã môn học (code) và tên môn học (name) không được để trống.',
      });
    }

    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();

    // Kiểm tra trùng mã môn học (trong phạm vi user)
    const existCheck = await pool.query(
      'SELECT id FROM subjects WHERE UPPER(code) = $1 AND (user_id = $2 OR (user_id IS NULL AND $2 IS NULL))',
      [cleanCode, userId]
    );

    if (existCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Mã môn học "${cleanCode}" đã tồn tại.`,
      });
    }

    const insertResult = await pool.query(
      `INSERT INTO subjects (code, name, user_id)
       VALUES ($1, $2, $3)
       RETURNING id, code, name, user_id, created_at`,
      [cleanCode, cleanName, userId]
    );

    return res.status(201).json({
      success: true,
      message: 'Thêm môn học mới thành công.',
      data: { ...insertResult.rows[0], document_count: 0 },
    });
  } catch (error) {
    console.error('[Subject] Error creating subject:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi thêm môn học mới.',
    });
  }
};

const updateSubject = async (req, res) => {
  try {
    const subjectId = Number(req.params.id);
    const { code, name } = req.body || {};
    const userId = req.user?.id || null;
    if (!Number.isSafeInteger(subjectId) || subjectId < 1 ||
        typeof code !== 'string' || !code.trim() || code.trim().length > 50 ||
        typeof name !== 'string' || !name.trim() || name.trim().length > 255) {
      return res.status(400).json({ success: false, message: 'ID, mã môn học và tên môn học hợp lệ là bắt buộc.' });
    }

    const result = await pool.query(
      `UPDATE subjects SET code = $1, name = $2
       WHERE id = $3 AND user_id IS NOT DISTINCT FROM $4
       RETURNING id, code, name, user_id, created_at`,
      [code.trim().toUpperCase(), name.trim(), subjectId, userId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy môn học thuộc tài khoản hiện tại.' });
    }
    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'Mã môn học này đã được sử dụng.' });
    }
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật môn học.' });
  }
};

/**
 * Xóa môn học
 * DELETE /api/subjects/:id
 */
const deleteSubject = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || null;

    if (!id || isNaN(parseInt(id, 10))) {
      return res.status(400).json({
        success: false,
        message: 'ID môn học không hợp lệ.',
      });
    }

    // Kiểm tra quyền sở hữu
    const subject = await pool.query(
      'SELECT id, code, name, user_id FROM subjects WHERE id = $1 AND user_id IS NOT DISTINCT FROM $2',
      [id, userId]
    );
    if (subject.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Không tìm thấy môn học với ID = ${id}.`,
      });
    }

    await pool.query('DELETE FROM subjects WHERE id = $1', [id]);

    return res.status(200).json({
      success: true,
      message: `Đã xóa môn học: ${subject.rows[0].name} (${subject.rows[0].code})`,
      data: subject.rows[0],
    });
  } catch (error) {
    console.error('[Subject] Error deleting subject:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi xóa môn học.',
    });
  }
};

/**
 * Lấy thống kê chi tiết của 1 môn học
 * GET /api/subjects/:id/stats
 */
const getSubjectStats = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id, 10))) {
      return res.status(400).json({ success: false, message: 'ID môn học không hợp lệ.' });
    }

    const userId = req.user?.id || null;
    const [subjectRes, docRes, chatRes] = await Promise.all([
      pool.query('SELECT id, code, name, created_at FROM subjects WHERE id = $1 AND user_id IS NOT DISTINCT FROM $2', [id, userId]),
      pool.query(
        'SELECT COUNT(*)::int AS total FROM documents d JOIN subjects s ON s.id = d.subject_id WHERE s.id = $1 AND s.user_id IS NOT DISTINCT FROM $2',
        [id, userId]
      ),
      pool.query(
        'SELECT COUNT(*)::int AS total FROM chat_histories c JOIN subjects s ON s.id = c.subject_id WHERE s.id = $1 AND s.user_id IS NOT DISTINCT FROM $2',
        [id, userId]
      ),
    ]);

    if (subjectRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Môn học không tồn tại.' });
    }

    return res.status(200).json({
      success: true,
      data: {
        subject: subjectRes.rows[0],
        document_count: docRes.rows[0].total,
        chat_count: chatRes.rows[0].total,
      },
    });
  } catch (error) {
    console.error('[Subject] Error fetching stats:', error.message);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy thống kê.' });
  }
};

module.exports = {
  getAllSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
  getSubjectStats,
};
