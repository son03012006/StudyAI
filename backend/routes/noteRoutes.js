const express = require('express');
const {
  listNotes,
  createNote,
  updateNote,
  deleteNote,
} = require('../controllers/noteController');
const { requireAuth } = require('../middlewares/authMiddleware');

const router = express.Router();
router.use(requireAuth);
router.get('/', listNotes);
router.post('/', createNote);
router.put('/:id', updateNote);
router.delete('/:id', deleteNote);

module.exports = router;
