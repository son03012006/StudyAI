const { pool } = require('../config/db');

const getDashboardStats = async (req, res, next) => {
  try {
    const userId = req.user?.id || null;
    const [statsResult, quizzesResult] = await Promise.all([
      pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM subjects s WHERE s.user_id IS NOT DISTINCT FROM $1) AS subject_count,
           (SELECT COUNT(*)::int FROM documents d JOIN subjects s ON s.id = d.subject_id
            WHERE s.user_id IS NOT DISTINCT FROM $1) AS document_count,
           (SELECT COUNT(*)::int FROM chat_histories c JOIN subjects s ON s.id = c.subject_id
            WHERE s.user_id IS NOT DISTINCT FROM $1) AS chat_count,
           (SELECT COUNT(*)::int FROM quiz_attempts a JOIN subjects s ON s.id = a.subject_id
            WHERE s.user_id IS NOT DISTINCT FROM $1) AS quiz_attempt_count,
           (SELECT COALESCE(ROUND(AVG(a.score::numeric * 100 / NULLIF(a.total, 0))), 0)::int
            FROM quiz_attempts a JOIN subjects s ON s.id = a.subject_id
            WHERE s.user_id IS NOT DISTINCT FROM $1) AS average_quiz_percentage,
           (SELECT COUNT(*)::int FROM study_plans p WHERE p.user_id IS NOT DISTINCT FROM $1) AS plan_count,
           (SELECT COALESCE(SUM(p.completed_tasks), 0)::int FROM study_plans p
            WHERE p.user_id IS NOT DISTINCT FROM $1) AS completed_task_count,
           (SELECT COALESCE(SUM(p.total_tasks), 0)::int FROM study_plans p
            WHERE p.user_id IS NOT DISTINCT FROM $1) AS total_task_count,
           (SELECT COALESCE(json_agg(json_build_object(
              'date', days.day::date,
              'study_count', (SELECT COUNT(*)::int FROM study_records r
                WHERE r.user_id IS NOT DISTINCT FROM $1 AND r.created_at::date = days.day::date),
              'quiz_count', (SELECT COUNT(*)::int FROM quiz_attempts a
                JOIN subjects s ON s.id = a.subject_id
                WHERE s.user_id IS NOT DISTINCT FROM $1 AND a.created_at::date = days.day::date)
            ) ORDER BY days.day), '[]'::json) FROM generate_series(
              CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day'
            ) AS days(day)) AS weekly_activity`,
        [userId]
      ),
      pool.query(
        `SELECT a.id, a.score, a.total,
                ROUND(a.score::numeric * 100 / NULLIF(a.total, 0))::int AS percentage,
                d.file_name AS document_name, s.name AS subject_name, a.created_at
         FROM quiz_attempts a
         JOIN subjects s ON s.id = a.subject_id
         JOIN documents d ON d.id = a.document_id
         WHERE s.user_id IS NOT DISTINCT FROM $1
         ORDER BY a.created_at DESC
         LIMIT 5`,
        [userId]
      ),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        ...statsResult.rows[0],
        weekly_activity: statsResult.rows[0].weekly_activity,
        recent_quizzes: quizzesResult.rows,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getDashboardStats };
