const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { getJwtSecret } = require('../config/secrets');

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const publicUserFields = 'id, name, email, school, major, target_gpa, avatar, created_at';
const validText = (value, maxLength) => (
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength
);

const createToken = (user) => jwt.sign(
  { id: user.id, email: user.email, name: user.name },
  getJwtSecret(),
  { expiresIn: JWT_EXPIRES_IN, algorithm: 'HS256' }
);

const register = async (req, res, next) => {
  try {
    const { name, email, password, school, major } = req.body || {};
    if (!validText(name, 150) || typeof email !== 'string' || email.trim().length > 150 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        typeof password !== 'string' || password.length < 6 || password.length > 128) {
      return res.status(400).json({
        success: false,
        message: 'Họ tên, email hợp lệ và mật khẩu từ 6 đến 128 ký tự là bắt buộc.',
      });
    }
    if ((school !== undefined && typeof school !== 'string') ||
        (major !== undefined && typeof major !== 'string') ||
        (school && school.trim().length > 200) || (major && major.trim().length > 200)) {
      return res.status(400).json({ success: false, message: 'Thông tin trường hoặc chuyên ngành không hợp lệ.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, school, major)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${publicUserFields}`,
      [name.trim(), cleanEmail, passwordHash, school?.trim() || 'Đại học Quốc Gia', major?.trim() || 'Công nghệ thông tin']
    );
    const user = result.rows[0];
    return res.status(201).json({ success: true, data: { user, token: createToken(user) } });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'Email này đã được đăng ký. Vui lòng đăng nhập.' });
    }
    return next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập email và mật khẩu.' });
    }
    const result = await pool.query(
      `SELECT ${publicUserFields}, password_hash FROM users WHERE email = $1`,
      [email.trim().toLowerCase()]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ success: false, message: 'Email hoặc mật khẩu không chính xác.' });
    }
    delete user.password_hash;
    return res.status(200).json({ success: true, data: { user, token: createToken(user) } });
  } catch (error) {
    return next(error);
  }
};

const getProfile = async (req, res, next) => {
  try {
    const [userResult, statsResult] = await Promise.all([
      pool.query(`SELECT ${publicUserFields} FROM users WHERE id = $1`, [req.user.id]),
      pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM subjects WHERE user_id = $1) AS "totalSubjects",
           (SELECT COUNT(*)::int FROM documents d JOIN subjects s ON s.id = d.subject_id WHERE s.user_id = $1) AS "totalDocuments",
           (SELECT COUNT(*)::int FROM chat_histories c JOIN subjects s ON s.id = c.subject_id WHERE s.user_id = $1) AS "totalChats",
           (SELECT COUNT(*)::int FROM study_plans WHERE user_id = $1) AS "totalPlans"`,
        [req.user.id]
      ),
    ]);
    if (!userResult.rows.length) {
      return res.status(401).json({ success: false, message: 'Tài khoản không còn tồn tại. Vui lòng đăng nhập lại.' });
    }
    return res.status(200).json({ success: true, data: { ...userResult.rows[0], stats: statsResult.rows[0] } });
  } catch (error) {
    return next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const { name, school = '', major = '', target_gpa = '' } = req.body || {};
    if (!validText(name, 150) || typeof school !== 'string' || school.trim().length > 200 ||
        typeof major !== 'string' || major.trim().length > 200 ||
        typeof target_gpa !== 'string' || target_gpa.trim().length > 50) {
      return res.status(400).json({ success: false, message: 'Thông tin hồ sơ không hợp lệ.' });
    }
    const result = await pool.query(
      `UPDATE users SET name = $1, school = $2, major = $3, target_gpa = $4
       WHERE id = $5 RETURNING ${publicUserFields}`,
      [name.trim(), school.trim(), major.trim(), target_gpa.trim(), req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });
    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    return next(error);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || !currentPassword ||
        typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại hợp lệ và mật khẩu mới từ 8 đến 128 ký tự là bắt buộc.' });
    }
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });
    if (!(await bcrypt.compare(currentPassword, result.rows[0].password_hash))) {
      return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không chính xác.' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, req.user.id]);
    return res.status(200).json({ success: true, message: 'Đổi mật khẩu thành công.' });
  } catch (error) {
    return next(error);
  }
};

module.exports = { register, login, getProfile, updateProfile, changePassword };