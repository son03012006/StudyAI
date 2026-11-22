import api from './api';

export const authService = {
  /**
   * Đăng ký tài khoản
   */
  async register(data) {
    const response = await api.post('/auth/register', data);
    if (response.data?.data?.token) {
      localStorage.setItem('studyai_token', response.data.data.token);
      localStorage.setItem('studyai_user', JSON.stringify(response.data.data.user));
    }
    return response.data;
  },

  /**
   * Đăng nhập
   */
  async login(data) {
    const response = await api.post('/auth/login', data);
    if (response.data?.data?.token) {
      localStorage.setItem('studyai_token', response.data.data.token);
      localStorage.setItem('studyai_user', JSON.stringify(response.data.data.user));
    }
    return response.data;
  },

  /**
   * Lấy thông tin cá nhân & thống kê
   */
  async getProfile() {
    const response = await api.get('/auth/profile');
    return response.data;
  },

  /**
   * Cập nhật thông tin cá nhân
   */
  async updateProfile(data) {
    const response = await api.put('/auth/profile', data);
    if (response.data?.data) {
      localStorage.setItem('studyai_user', JSON.stringify(response.data.data));
    }
    return response.data;
  },

  async changePassword(data) {
    const response = await api.put('/auth/password', data);
    return response.data;
  },

  /**
   * Đăng xuất
   */
  logout() {
    localStorage.removeItem('studyai_token');
    localStorage.removeItem('studyai_user');
  },

  /**
   * Lấy user đang lưu trong máy
   */
  getCurrentUser() {
    try {
      const userStr = localStorage.getItem('studyai_user');
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  },
};

export default authService;
