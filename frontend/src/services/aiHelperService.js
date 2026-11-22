import api from './api';

export const aiHelperService = {
  /**
   * Kiểm tra trạng thái Backend, Python AI Service và Ollama cục bộ
   */
  async getAIHealth() {
    const response = await api.get('/health/ai');
    return response.data;
  },

  /**
   * Giải thích kiến thức theo nhiều cấp độ
   * @param {string} concept
   * @param {string} level - 'simple' | 'student' | 'expert' | 'analogy'
   */
  async explainConcept(concept, level = 'student') {
    const response = await api.post('/ai/explain', { concept, level });
    return response.data;
  },

  /**
   * Hướng dẫn giải bài tập chi tiết từng bước
   * @param {string} problem
   * @param {string} subject
   */
  async solveExercise(problem, subject = '') {
    const response = await api.post('/ai/solve-exercise', { problem, subject });
    return response.data;
  },

  /**
   * Tạo kế hoạch học tập cá nhân hóa
   * @param {object} planData
   */
  async createStudyPlan(planData) {
    const response = await api.post('/ai/study-plan', planData);
    return response.data;
  },

  /**
   * Lấy danh sách kế hoạch học tập
   */
  async getStudyPlans() {
    const response = await api.get('/ai/study-plans');
    return response.data;
  },

  /**
   * Cập nhật tiến độ nhiệm vụ trong kế hoạch
   * @param {number|string} planId
   * @param {number} completedTasks
   */
  async updatePlanTask(planId, dayIndex, taskIndex, completed) {
    const response = await api.patch(`/ai/study-plans/${planId}/tasks/${dayIndex}/${taskIndex}`, {
      completed,
    });
    return response.data;
  },

  /**
   * Xóa kế hoạch học tập
   * @param {number|string} planId
   */
  async deleteStudyPlan(planId) {
    const response = await api.delete(`/ai/study-plans/${planId}`);
    return response.data;
  },
};

export default aiHelperService;
