const { pool } = require('../config/db');
const {
  explainConcept,
  solveHomework,
  generateStudyPlan,
} = require('../services/aiService');

const handleExplain = async (req, res, next) => {
  try {
    const { concept, level = 'student' } = req.body || {};
    if (typeof concept !== 'string' || !concept.trim() || concept.trim().length > 1000) {
      return res.status(400).json({ success: false, message: 'Khái niệm cần giải thích phải dài từ 1 đến 1.000 ký tự.' });
    }
    if (!['simple', 'student', 'expert', 'analogy'].includes(level)) {
      return res.status(400).json({ success: false, message: 'Cấp độ giải thích không hợp lệ.' });
    }

    const explanation = await explainConcept(concept.trim(), level);
    if (req.user?.id) {
      await pool.query(
        'INSERT INTO study_records (user_id, activity_type, details) VALUES ($1, $2, $3)',
        [req.user.id, 'explain', JSON.stringify({ concept: concept.trim(), level })]
      );
    }
    return res.status(200).json({ success: true, data: { concept: concept.trim(), level, explanation } });
  } catch (error) {
    return next(error);
  }
};

const handleSolveExercise = async (req, res, next) => {
  try {
    const { problem, subject = '' } = req.body || {};
    if (typeof problem !== 'string' || !problem.trim() || problem.trim().length > 12000 ||
        typeof subject !== 'string' || subject.length > 200) {
      return res.status(400).json({ success: false, message: 'Đề bài hoặc môn học không hợp lệ.' });
    }
    const solution = await solveHomework(problem.trim(), subject.trim());
    if (req.user?.id) {
      await pool.query(
        'INSERT INTO study_records (user_id, activity_type, details) VALUES ($1, $2, $3)',
        [req.user.id, 'solve', JSON.stringify({ problem: problem.trim().slice(0, 100), subject: subject.trim() })]
      );
    }
    return res.status(200).json({ success: true, data: { problem: problem.trim(), subject: subject.trim(), solution } });
  } catch (error) {
    return next(error);
  }
};

const handleCreateStudyPlan = async (req, res, next) => {
  try {
    const {
      subject_id: subjectId,
      subjectName,
      goal = '',
      durationDays = 7,
      hoursPerDay = 2,
      currentLevel = 'Cơ bản',
    } = req.body || {};
    const days = Number(durationDays);
    const hours = Number(hoursPerDay);
    if (typeof subjectName !== 'string' || !subjectName.trim() || subjectName.trim().length > 200 ||
        !Number.isInteger(days) || days < 1 || days > 30 ||
        !Number.isFinite(hours) || hours <= 0 || hours > 12 ||
        typeof goal !== 'string' || goal.length > 500 ||
        typeof currentLevel !== 'string' || currentLevel.length > 100) {
      return res.status(400).json({ success: false, message: 'Thông tin môn học hoặc thời lượng kế hoạch không hợp lệ.' });
    }

    const userId = req.user?.id || null;
    const cleanSubjectId = subjectId === undefined || subjectId === null || subjectId === '' ? null : Number(subjectId);
    if (cleanSubjectId !== null) {
      if (!Number.isSafeInteger(cleanSubjectId) || cleanSubjectId < 1) {
        return res.status(400).json({ success: false, message: 'ID môn học không hợp lệ.' });
      }
      const subject = await pool.query(
        'SELECT id FROM subjects WHERE id = $1 AND user_id IS NOT DISTINCT FROM $2',
        [cleanSubjectId, userId]
      );
      if (!subject.rows.length) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy môn học thuộc tài khoản hiện tại.' });
      }
    }

    const plan = await generateStudyPlan({
      subjectName: subjectName.trim(),
      goal: goal.trim(),
      durationDays: days,
      hoursPerDay: hours,
      currentLevel: currentLevel.trim(),
    });
    if (!plan || typeof plan !== 'object' || !Array.isArray(plan.days) || plan.days.length !== days ||
        plan.days.some((day) => !day || typeof day.theme !== 'string' || !Array.isArray(day.tasks) ||
          day.tasks.length === 0 || day.tasks.some((task) => typeof task !== 'string' || !task.trim()))) {
      return res.status(502).json({ success: false, message: 'AI trả về kế hoạch không đầy đủ; vui lòng thử lại.' });
    }
    const totalTasks = plan.days.reduce((total, day) => total + day.tasks.length, 0);
    const result = await pool.query(
      `INSERT INTO study_plans
         (user_id, subject_id, title, target_goal, duration_days, plan_schedule, completed_tasks, total_tasks)
       VALUES ($1, $2, $3, $4, $5, $6, 0, $7)
       RETURNING *`,
      [
        userId,
        cleanSubjectId,
        typeof plan.title === 'string' && plan.title.trim() ? plan.title.trim() : `Lộ trình học ${subjectName.trim()}`,
        goal.trim() || 'Nắm vững kiến thức và đạt điểm cao',
        days,
        JSON.stringify(plan),
        totalTasks,
      ]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    return next(error);
  }
};

const handleGetStudyPlans = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT p.*,
              COALESCE((
                SELECT jsonb_object_agg(t.day_index::text || '-' || t.task_index::text, t.completed)
                FROM study_plan_tasks t WHERE t.plan_id = p.id
              ), '{}'::jsonb) AS task_states
       FROM study_plans p
       WHERE p.user_id IS NOT DISTINCT FROM $1
       ORDER BY p.created_at DESC`,
      [req.user?.id || null]
    );
    return res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    return next(error);
  }
};

const handleUpdatePlanTask = async (req, res, next) => {
  let client;
  let transactionOpen = false;
  try {
    const planId = Number(req.params.id);
    const dayIndex = Number(req.params.dayIndex);
    const taskIndex = Number(req.params.taskIndex);
    const { completed } = req.body || {};
    if (![planId, dayIndex, taskIndex].every(Number.isSafeInteger) ||
        planId < 1 || dayIndex < 0 || taskIndex < 0 || typeof completed !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Thông tin nhiệm vụ học tập không hợp lệ.' });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    transactionOpen = true;
    const planResult = await client.query(
      'SELECT plan_schedule FROM study_plans WHERE id = $1 AND user_id IS NOT DISTINCT FROM $2 FOR UPDATE',
      [planId, req.user?.id || null]
    );
    const days = planResult.rows[0]?.plan_schedule?.days;
    if (!Array.isArray(days) || !Array.isArray(days[dayIndex]?.tasks) || taskIndex >= days[dayIndex].tasks.length) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(404).json({ success: false, message: 'Không tìm thấy kế hoạch hoặc nhiệm vụ.' });
    }
    await client.query(
      `INSERT INTO study_plan_tasks (plan_id, day_index, task_index, completed)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (plan_id, day_index, task_index) DO UPDATE SET completed = EXCLUDED.completed`,
      [planId, dayIndex, taskIndex, completed]
    );
    const result = await client.query(
      `UPDATE study_plans SET completed_tasks = (
         SELECT COUNT(*)::int FROM study_plan_tasks WHERE plan_id = $1 AND completed = TRUE
       ) WHERE id = $1 RETURNING id, completed_tasks, total_tasks`,
      [planId]
    );
    await client.query('COMMIT');
    transactionOpen = false;
    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (client && transactionOpen) await client.query('ROLLBACK');
    return next(error);
  } finally {
    if (client) client.release();
  }
};

const handleDeleteStudyPlan = async (req, res, next) => {
  try {
    const planId = Number(req.params.id);
    if (!Number.isSafeInteger(planId) || planId < 1) {
      return res.status(400).json({ success: false, message: 'ID kế hoạch không hợp lệ.' });
    }
    const result = await pool.query(
      'DELETE FROM study_plans WHERE id = $1 AND user_id IS NOT DISTINCT FROM $2 RETURNING id',
      [planId, req.user?.id || null]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Không tìm thấy kế hoạch học tập.' });
    return res.status(200).json({ success: true, data: { id: result.rows[0].id } });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  handleExplain,
  handleSolveExercise,
  handleCreateStudyPlan,
  handleGetStudyPlans,
  handleUpdatePlanTask,
  handleDeleteStudyPlan,
};