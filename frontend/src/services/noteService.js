import api from './api';

const noteService = {
  async getAll() {
    const response = await api.get('/notes');
    return response.data;
  },

  async create(data) {
    const response = await api.post('/notes', data);
    return response.data;
  },

  async update(id, data) {
    const response = await api.put(`/notes/${id}`, data);
    return response.data;
  },

  async delete(id) {
    const response = await api.delete(`/notes/${id}`);
    return response.data;
  },
};

export default noteService;
