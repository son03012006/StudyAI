import api from './api';

export const subjectService = {
  /**
   * Lấy danh sách tất cả môn học
   */
  async getAll() {
    const response = await api.get('/subjects');
    return response.data;
  },

  /**
   * Thêm môn học mới
   * @param {{ code: string, name: string }} data
   */
  async create(data) {
    const response = await api.post('/subjects', data);
    return response.data;
  },

  async update(id, data) {
    const response = await api.put(`/subjects/${id}`, data);
    return response.data;
  },

  /**
   * Xóa môn học theo ID
   * @param {number|string} id
   */
  async delete(id) {
    const response = await api.delete(`/subjects/${id}`);
    return response.data;
  },
};

export default subjectService;
