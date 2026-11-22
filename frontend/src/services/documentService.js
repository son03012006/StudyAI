import api from './api';

export const documentService = {
  /**
   * Tải lên tài liệu mới cho môn học
   * @param {File} file
   * @param {number|string} subjectId
   */
  async upload(file, subjectId) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('subject_id', subjectId);

    const response = await api.post('/documents/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  /**
   * Lấy danh sách tài liệu theo ID môn học
   * @param {number|string} subjectId
   */
  async getBySubject(subjectId) {
    const response = await api.get(`/documents/subject/${subjectId}`);
    return response.data;
  },

  /**
   * Yêu cầu AI tóm tắt tài liệu
   * @param {number|string} documentId
   */
  async summarize(documentId) {
    const response = await api.post(`/documents/${documentId}/summarize`);
    return response.data;
  },

  async getSummaries(documentId) {
    const response = await api.get(`/documents/${documentId}/summaries`);
    return response.data;
  },

  /**
   * Đặt câu hỏi AI dựa trên ngữ cảnh tài liệu
   * @param {number|string} documentId
   * @param {string} question
   */
  async chat(documentId, question) {
    const response = await api.post(`/documents/${documentId}/chat`, { question });
    return response.data;
  },

  /**
   * Tải lịch sử hỏi đáp của tài liệu
   * @param {number|string} documentId
   */
  async getHistory(documentId) {
    const response = await api.get(`/documents/${documentId}/history`);
    return response.data;
  },

  /**
   * Yêu cầu AI sinh bài trắc nghiệm từ tài liệu
   * @param {number|string} documentId
   */
  async generateQuiz(documentId) {
    const response = await api.post(`/documents/${documentId}/quiz`);
    return response.data;
  },

  async generateEssayQuiz(documentId, count = 5, difficulty = 'medium') {
    const response = await api.post(`/documents/${documentId}/essay-quiz`, { count, difficulty });
    return response.data;
  },

  async submitEssayQuiz(documentId, quizId, answers) {
    const response = await api.post(`/documents/${documentId}/essay-quiz/${quizId}/submit`, { answers });
    return response.data;
  },

  async saveQuizAttempt(documentId, quizId, userAnswers) {
    const response = await api.post(`/documents/${documentId}/quiz-attempts`, {
      quiz_id: quizId,
      user_answers: userAnswers,
    });
    return response.data;
  },

  async getQuizAttempts(subjectId) {
    const response = await api.get(`/subjects/${subjectId}/quiz-attempts`);
    return response.data;
  },

  async clearQuizAttempts(subjectId) {
    const response = await api.delete(`/subjects/${subjectId}/quiz-attempts`);
    return response.data;
  },

  /**
   * Yêu cầu AI sinh bộ thẻ ghi nhớ (Flashcards) từ tài liệu
   * @param {number|string} documentId
   */
  async generateFlashcards(documentId) {
    const response = await api.post(`/documents/${documentId}/flashcards`);
    return response.data;
  },

  /**
   * Xóa tài liệu
   * @param {number|string} documentId
   */
  async delete(documentId) {
    const response = await api.delete(`/documents/${documentId}`);
    return response.data;
  },
};

export default documentService;
