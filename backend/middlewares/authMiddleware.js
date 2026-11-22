const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/secrets');

const unauthorized = (res, message = 'Vui lòng đăng nhập để tiếp tục.') => res.status(401).json({
  success: false,
  message,
  code: 'UNAUTHORIZED',
});

const authenticate = (req, res, next, required) => {
  const authorization = req.get('authorization');
  if (!authorization) {
    if (!required) return next();
    return unauthorized(res);
  }

  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match) return unauthorized(res, 'Token xác thực không hợp lệ.');

  try {
    const payload = jwt.verify(match[1], getJwtSecret(), { algorithms: ['HS256'] });
    const id = Number(payload.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return unauthorized(res, 'Token xác thực không hợp lệ.');
    }

    req.user = {
      id,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      name: typeof payload.name === 'string' ? payload.name : undefined,
    };
    return next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return unauthorized(res, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    }
    return next(error);
  }
};

const requireAuth = (req, res, next) => authenticate(req, res, next, true);
const optionalAuth = (req, res, next) => authenticate(req, res, next, false);

module.exports = { requireAuth, optionalAuth };