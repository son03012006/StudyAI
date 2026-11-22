const { pool } = require('./db');

const initDatabase = async () => {
  const createTablesQuery = `
    -- 1. Bảng người dùng (users)
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      avatar VARCHAR(500),
      school VARCHAR(200) DEFAULT 'Đại học Quốc Gia',
      major VARCHAR(200) DEFAULT 'Công nghệ thông tin',
      target_gpa VARCHAR(50) DEFAULT '3.6 / 4.0',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Bảng môn học (subjects)
    CREATE TABLE IF NOT EXISTS subjects (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      code VARCHAR(50) NOT NULL,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE subjects ADD COLUMN IF NOT EXISTS user_id INT REFERENCES users(id) ON DELETE CASCADE;

    -- 3. Bảng tài liệu học tập (documents)
    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      subject_id INT REFERENCES subjects(id) ON DELETE CASCADE,
      file_name VARCHAR(255) NOT NULL,
      file_path VARCHAR(500) NOT NULL,
      file_size INT,
      content TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE documents ADD COLUMN IF NOT EXISTS content TEXT;

    -- 4. Bảng lịch sử trò chuyện AI (chat_histories)
    CREATE TABLE IF NOT EXISTS chat_histories (
      id SERIAL PRIMARY KEY,
      subject_id INT REFERENCES subjects(id) ON DELETE CASCADE,
      document_id INT REFERENCES documents(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE chat_histories ADD COLUMN IF NOT EXISTS document_id INT REFERENCES documents(id) ON DELETE CASCADE;
    ALTER TABLE chat_histories ADD COLUMN IF NOT EXISTS sources JSONB NOT NULL DEFAULT '[]'::jsonb;

    -- 5. Bảng kế hoạch học tập cá nhân hóa (study_plans)
    CREATE TABLE IF NOT EXISTS study_plans (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      subject_id INT REFERENCES subjects(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      target_goal VARCHAR(255),
      duration_days INT DEFAULT 7,
      plan_schedule JSONB,
      completed_tasks INT DEFAULT 0,
      total_tasks INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 6. Bảng nhật ký & tiến độ học tập (study_records)
    CREATE TABLE IF NOT EXISTS study_records (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      activity_type VARCHAR(50) NOT NULL,
      details JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS document_summaries (
      id SERIAL PRIMARY KEY,
      document_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      model_name VARCHAR(150) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS document_chunks (
      id SERIAL PRIMARY KEY,
      document_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      chunk_index INT NOT NULL,
      content TEXT NOT NULL,
      embedding JSONB NOT NULL,
      model_name VARCHAR(150) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(document_id, chunk_index, model_name)
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      subject_id INT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      document_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      quiz_data JSONB NOT NULL,
      model_name VARCHAR(150) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id SERIAL PRIMARY KEY,
      quiz_id INT REFERENCES quizzes(id) ON DELETE SET NULL,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      subject_id INT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      document_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      quiz_data JSONB NOT NULL,
      user_answers JSONB NOT NULL,
      score INT NOT NULL CHECK (score >= 0),
      total INT NOT NULL CHECK (total > 0 AND score <= total),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS essay_quizzes (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      subject_id INT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      document_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      quiz_data JSONB NOT NULL,
      model_name VARCHAR(150) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS essay_quiz_attempts (
      id SERIAL PRIMARY KEY,
      quiz_id INT NOT NULL REFERENCES essay_quizzes(id) ON DELETE CASCADE,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      user_answers JSONB NOT NULL,
      results JSONB NOT NULL,
      score NUMERIC(6, 2) NOT NULL CHECK (score >= 0),
      total_score NUMERIC(6, 2) NOT NULL CHECK (total_score > 0 AND score <= total_score),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS study_plan_tasks (
      id SERIAL PRIMARY KEY,
      plan_id INT NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,
      day_index INT NOT NULL CHECK (day_index >= 0),
      task_index INT NOT NULL CHECK (task_index >= 0),
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      UNIQUE(plan_id, day_index, task_index)
    );

    CREATE TABLE IF NOT EXISTS notes (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject_id INT REFERENCES subjects(id) ON DELETE SET NULL,
      title VARCHAR(200) NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS quiz_id INT REFERENCES quizzes(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_document_chunks_document ON document_chunks(document_id);
    CREATE INDEX IF NOT EXISTS idx_quiz_attempts_subject_user ON quiz_attempts(subject_id, user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_quizzes_document_user ON quizzes(document_id, user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_essay_quizzes_document_user ON essay_quizzes(document_id, user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_essay_quiz_attempts_quiz_user ON essay_quiz_attempts(quiz_id, user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_study_plan_tasks_plan ON study_plan_tasks(plan_id);
    CREATE INDEX IF NOT EXISTS idx_notes_user_updated ON notes(user_id, updated_at DESC);
  `;

  try {
    console.log('[Database] Checking & initializing tables...');
    await pool.query(createTablesQuery);
    console.log('[Database] All tables initialized successfully.');
  } catch (error) {
    console.error('[Database] Error initializing tables:', error.message);
    throw error;
  }
};

module.exports = { initDatabase };
