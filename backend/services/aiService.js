/**
 * aiService.js — AI Service sử dụng Ollama Local LLM
 * ====================================================
 * KHÔNG dùng Gemini API, OpenAI API hay bất kỳ external AI API nào.
 * Toàn bộ AI chạy local thông qua Ollama (http://localhost:11434).
 *
 * Cách cài đặt Ollama:
 *   1. Tải tại: https://ollama.com/download (Windows)
 *   2. Cài đặt và chạy: ollama serve
 *   3. Tải model: ollama pull qwen2.5:3b
 *   4. Cấu hình .env: OLLAMA_URL=http://localhost:11434
 *                     OLLAMA_MODEL=qwen2.5:3b
 */

const fs = require('fs');
const http = require('http');
const https = require('https');
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
require('dotenv').config();

// ============================================================
// CẤU HÌNH OLLAMA
// ============================================================
const OLLAMA_BASE_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b';
const OLLAMA_EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || '').replace(/\/+$/, '');
const OLLAMA_TIMEOUT_MS = parseInt(process.env.OLLAMA_TIMEOUT_MS || '120000', 10); // 2 phút
const AI_SERVICE_TIMEOUT_MS = parseInt(process.env.AI_SERVICE_TIMEOUT_MS || '600000', 10);

const requestAiService = (endpoint, payload) => new Promise((resolve, reject) => {
  if (!AI_SERVICE_URL) {
    reject(new Error('Python AI Service URL is not configured.'));
    return;
  }
  const isBinary = Buffer.isBuffer(payload);
  const serializedPayload = isBinary ? payload : JSON.stringify(payload);
  const urlObj = new URL(`${AI_SERVICE_URL}${endpoint}`);
  const lib = urlObj.protocol === 'https:' ? https : http;
  const request = lib.request({
    hostname: urlObj.hostname,
    port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
    path: `${urlObj.pathname}${urlObj.search}`,
    method: 'POST',
    headers: {
      'Content-Type': isBinary ? 'application/pdf' : 'application/json',
      'Content-Length': Buffer.byteLength(serializedPayload),
    },
  }, (response) => {
    let responseBody = '';
    response.on('data', (chunk) => { responseBody += chunk; });
    response.on('end', () => {
      let parsed;
      try {
        parsed = JSON.parse(responseBody);
      } catch (error) {
        reject(new Error(`Unable to parse Python AI Service response: ${error.message}`));
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        const detail = typeof parsed.detail === 'string'
          ? parsed.detail
          : parsed.detail ? JSON.stringify(parsed.detail) : `HTTP ${response.statusCode}`;
        reject(new Error(`Python AI Service error: ${detail}`));
        return;
      }
      resolve(parsed);
    });
  });
  request.setTimeout(AI_SERVICE_TIMEOUT_MS, () => {
    request.destroy(new Error(`Python AI Service timeout after ${AI_SERVICE_TIMEOUT_MS / 1000}s.`));
  });
  request.on('error', (error) => reject(new Error(`Python AI Service request failed: ${error.message}`)));
  request.write(serializedPayload);
  request.end();
});

// ============================================================
// HÀM GỌI OLLAMA API (không dùng thư viện ngoài)
// ============================================================
/**
 * Gọi Ollama API /api/generate để sinh văn bản
 * @param {string} prompt - Nội dung prompt
 * @param {object} options - Tùy chọn thêm (temperature, top_p, ...)
 * @returns {Promise<string>} - Văn bản được sinh ra
 */
const callOllama = (prompt, options = {}) => {
  if (AI_SERVICE_URL) {
    return requestAiService('/generate', { prompt, options })
      .then((result) => {
        if (typeof result.response !== 'string' || !result.response.trim()) {
          throw new Error('Python AI Service returned an empty generation.');
        }
        return result.response.trim();
      });
  }
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: prompt,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        top_p: options.top_p ?? 0.9,
        num_predict: options.num_predict ?? 2048,
        ...options.extra,
      },
    });

    const urlObj = new URL(`${OLLAMA_BASE_URL}/api/generate`);
    const isHttps = urlObj.protocol === 'https:';
    const lib = isHttps ? https : http;

    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = lib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(`Ollama lỗi: ${parsed.error}`));
          } else {
            resolve((parsed.response || '').trim());
          }
        } catch (e) {
          reject(new Error(`Không thể phân tích phản hồi từ Ollama: ${e.message}`));
        }
      });
    });

    req.setTimeout(OLLAMA_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error(
        `Ollama timeout sau ${OLLAMA_TIMEOUT_MS / 1000}s. ` +
        `Model "${OLLAMA_MODEL}" có thể đang tải lần đầu hoặc máy chưa đủ RAM. ` +
        `Thử model nhẹ hơn: ollama pull qwen2.5:1.5b`
      ));
    });

    req.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        reject(new Error(
          'Không thể kết nối đến Ollama (ECONNREFUSED). ' +
          'Hãy đảm bảo Ollama đang chạy:\n' +
          '  1. Cài Ollama: https://ollama.com/download\n' +
          '  2. Chạy lệnh: ollama serve\n' +
          `  3. Tải model: ollama pull ${OLLAMA_MODEL}`
        ));
      } else {
        reject(new Error(`Lỗi kết nối Ollama: ${err.message}`));
      }
    });

    req.write(payload);
    req.end();
  });
};

/**
 * Kiểm tra Ollama có đang chạy và model có sẵn không
 */
const checkOllamaHealth = () => {
  return new Promise((resolve) => {
    const urlObj = new URL(`${OLLAMA_BASE_URL}/api/tags`);
    const lib = urlObj.protocol === 'https:' ? https : http;

    const req = lib.get(`${OLLAMA_BASE_URL}/api/tags`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const models = (parsed.models || []).map((m) => m.name);
          resolve({ running: true, models });
        } catch {
          resolve({ running: true, models: [] });
        }
      });
    });

    req.setTimeout(5000, () => {
      req.destroy();
      resolve({ running: false, models: [] });
    });

    req.on('error', () => {
      resolve({ running: false, models: [] });
    });
  });
};

const checkAiHealth = () => {
  if (!AI_SERVICE_URL) {
    return checkOllamaHealth().then((health) => ({
      ...health,
      aiServiceEnabled: false,
      aiServiceRunning: false,
      aiServiceReady: false,
      aiServiceStatus: 'not_configured',
      ollamaRunning: health.running,
      answerMode: 'ollama',
      qaCheckpointAvailable: false,
      embeddingModelLoaded: false,
    }));
  }
  return new Promise((resolve) => {
    const urlObj = new URL(`${AI_SERVICE_URL}/health`);
    const lib = urlObj.protocol === 'https:' ? https : http;
    const request = lib.get(urlObj, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            running: response.statusCode === 200 && parsed.status === 'ready',
            models: Array.isArray(parsed.available_models) ? parsed.available_models : [],
            aiServiceEnabled: true,
            aiServiceRunning: true,
            aiServiceReady: response.statusCode === 200 && parsed.status === 'ready',
            aiServiceStatus: parsed.status || 'unavailable',
            ollamaRunning: parsed.ollama_running === true,
            answerMode: parsed.answer_mode || null,
            qaCheckpointAvailable: parsed.qa_checkpoint_available === true,
            embeddingModelLoaded: parsed.embedding_model_loaded === true,
          });
        } catch {
          resolve({
            running: false,
            models: [],
            aiServiceEnabled: true,
            aiServiceRunning: false,
            aiServiceReady: false,
            aiServiceStatus: 'invalid_response',
            ollamaRunning: false,
          });
        }
      });
    });
    request.setTimeout(5000, () => {
      request.destroy();
      resolve({
        running: false,
        models: [],
        aiServiceEnabled: true,
        aiServiceRunning: false,
        aiServiceReady: false,
        aiServiceStatus: 'timeout',
        ollamaRunning: false,
      });
    });
    request.on('error', () => resolve({
      running: false,
      models: [],
      aiServiceEnabled: true,
      aiServiceRunning: false,
      aiServiceReady: false,
      aiServiceStatus: 'unavailable',
      ollamaRunning: false,
    }));
  });
};

const createEmbeddings = async (input) => {
  if (!AI_SERVICE_URL) {
    throw new Error('Local embeddings require the configured Python AI Service.');
  }
  const texts = Array.isArray(input) ? input : [input];
  if (!texts.length || texts.some((text) => typeof text !== 'string' || !text.trim())) {
    throw new Error('Embedding input must contain non-empty text.');
  }
  const embeddings = [];
  for (let offset = 0; offset < texts.length; offset += 32) {
    const result = await requestAiService('/embed', { input: texts.slice(offset, offset + 32) });
    const expectedCount = Math.min(32, texts.length - offset);
    if (!Array.isArray(result.embeddings) || result.embeddings.length !== expectedCount ||
        result.embeddings.some((vector) => !Array.isArray(vector) || !vector.length ||
          vector.some((value) => !Number.isFinite(value)))) {
      throw new Error('Python AI Service returned invalid embeddings.');
    }
    embeddings.push(...result.embeddings);
  }
  return embeddings;
};

const createEmbedding = async (input) => (await createEmbeddings(input))[0];

const ocrPDF = async (input) => {
  if (!AI_SERVICE_URL) throw new Error('PDF OCR requires the configured Python AI Service.');
  const pdf = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
  const result = await requestAiService('/ocr', pdf);
  if (typeof result.text !== 'string' || !result.text.trim()) {
    throw new Error('Python AI Service returned no OCR text.');
  }
  return result;
};

const answerWithContext = async (question, context, maxAnswerTokens = 192) => {
  const result = await requestAiService('/answer', {
    question,
    context,
    max_answer_tokens: Math.min(64, Math.max(1, maxAnswerTokens)),
  });
  if (typeof result.answer !== 'string' || !result.answer.trim()) {
    throw new Error('Python AI Service returned an empty answer.');
  }
  return result;
};

// ============================================================
// TRÍCH XUẤT VĂN BẢN TỪ FILE
// ============================================================
/**
 * Trích xuất văn bản từ file PDF
 */
const extractTextFromPDF = async (input) => {
  let parser;
  try {
    let dataBuffer;
    if (typeof input === 'string') {
      dataBuffer = fs.readFileSync(input);
    } else {
      dataBuffer = input;
    }
    parser = new PDFParse({ data: dataBuffer });
    const data = await parser.getText();
    return (data.text || '').trim();
  } catch (error) {
    console.error('[PDF Extract Error]:', error.message);
    throw new Error(`Lỗi khi đọc nội dung file PDF: ${error.message}`);
  } finally {
    if (parser) await parser.destroy();
  }
};

const extractTextFromDOCX = async (input) => {
  try {
    const result = await mammoth.extractRawText({ path: input });
    return result.value.trim();
  } catch (error) {
    throw new Error(`Lỗi khi đọc nội dung file DOCX: ${error.message}`);
  }
};

// ============================================================
// HELPER: Trích xuất JSON sạch từ phản hồi AI
// ============================================================
const extractCleanJSON = (raw) => {
  let cleaned = raw.trim();

  // Xóa markdown code block nếu có
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Thử tìm mảng JSON
    const arrStart = cleaned.indexOf('[');
    const arrEnd = cleaned.lastIndexOf(']');
    if (arrStart !== -1 && arrEnd > arrStart) {
      try {
        return JSON.parse(cleaned.substring(arrStart, arrEnd + 1));
      } catch {}
    }

    // Thử tìm object JSON
    const objStart = cleaned.indexOf('{');
    const objEnd = cleaned.lastIndexOf('}');
    if (objStart !== -1 && objEnd > objStart) {
      try {
        return JSON.parse(cleaned.substring(objStart, objEnd + 1));
      } catch {}
    }

    throw new Error(`Không thể phân tích JSON từ AI. Raw: ${cleaned.substring(0, 200)}`);
  }
};

// ============================================================
// CÁC HÀM AI CHÍNH
// ============================================================

/**
 * Tóm tắt nội dung bài giảng thành các ý chính chuẩn Markdown
 */
const summarizeText = async (text) => {
  if (!text || text.trim().length === 0) {
    throw new Error('Tài liệu không có nội dung chữ để tóm tắt.');
  }

  const truncatedText = text.slice(0, 12000);

  const prompt = `Bạn là chuyên gia sư phạm và Trợ lý AI giáo dục. Dưới đây là nội dung bài giảng/tài liệu học tập:

--- BẮT ĐẦU TÀI LIỆU ---
${truncatedText}
--- KẾT THÚC TÀI LIỆU ---

NHIỆM VỤ: Tóm tắt nội dung trên thành tài liệu ôn tập khoa học dành cho sinh viên theo định dạng Markdown tiếng Việt:
- Dùng tiêu đề ## và ### để phân cấp
- Dùng gạch đầu dòng (-) và in đậm (**từ khóa**) cho định nghĩa quan trọng
- Thêm > 💡 Lưu ý: cho các điểm dễ nhầm lẫn
- Kết thúc bằng phần ## 🎯 Điểm Cốt Lõi Cần Nhớ (3-5 ý)
- Chỉ trả về nội dung Markdown, không giải thích thêm

BẮT ĐẦU TÓM TẮT:`;

  return await callOllama(prompt, { temperature: 0.5, num_predict: 2048 });
};

/**
 * Trả lời thắc mắc của sinh viên dựa trên ngữ cảnh bài giảng (RAG)
 */
const askAI = async (textContext, question) => {
  if (!question || !question.trim()) {
    throw new Error('Vui lòng nhập câu hỏi cho AI.');
  }

  const contextSnippet = (textContext || '').slice(0, 10000);
  if (AI_SERVICE_URL && contextSnippet.trim()) {
    const result = await answerWithContext(question.trim(), contextSnippet);
    return result.answer;
  }

  const prompt = `Bạn là Trợ lý Học tập AI thông minh (EduMind AI), hỗ trợ sinh viên học tập.

NGỮ CẢNH TÀI LIỆU:
---
${contextSnippet || 'Không có tài liệu ngữ cảnh. Hãy trả lời dựa trên kiến thức chung.'}
---

CÂU HỎI CỦA SINH VIÊN: "${question.trim()}"

YÊU CẦU:
1. Đọc kỹ ngữ cảnh và trả lời câu hỏi chính xác, thân thiện, có tính sư phạm cao
2. Trích dẫn phần liên quan trong tài liệu nếu có
3. Định dạng bằng Markdown (in đậm, danh sách, bảng, code block nếu là lập trình)
4. Trả lời bằng tiếng Việt

TRẢ LỜI:`;

  return await callOllama(prompt, { temperature: 0.6, num_predict: 1500 });
};

/**
 * Giải thích kiến thức theo nhiều mức độ khác nhau
 * @param {string} concept - Khái niệm cần giải thích
 * @param {string} level - 'simple' | 'student' | 'expert' | 'analogy'
 */
const explainConcept = async (concept, level = 'student') => {
  if (!concept || !concept.trim()) {
    throw new Error('Vui lòng nhập khái niệm hoặc chủ đề cần giải thích.');
  }

  const levelMap = {
    simple:  'theo phong cách ELI5 (giải thích như cho học sinh cấp 2), dùng từ ngữ mộc mạc, gần gũi, tránh thuật ngữ học thuật',
    expert:  'theo mức độ Chuyên Gia/Kỹ Sư: đi sâu vào bản chất kỹ thuật, kiến trúc, cơ chế hoạt động, tối ưu hóa và trường hợp ngoại lệ',
    analogy: 'thông qua một Ẩn dụ thực tế (Analogy) hoặc ví dụ đời thường sinh động, giúp người đọc hình dung bức tranh toàn cảnh',
    student: 'theo mức độ Sinh Viên Đại Học: đầy đủ định nghĩa chuẩn, ý nghĩa, công thức/nguyên lý và ví dụ minh họa',
  };

  const instruction = levelMap[level] || levelMap.student;

  const prompt = `Bạn là chuyên gia sư phạm và Trợ lý AI EduMind. Hãy giải thích chủ đề sau: "${concept.trim()}"

CẤP ĐỘ GIẢI THÍCH: ${instruction}

CẤU TRÚC PHẢN HỒI (Markdown tiếng Việt):
## 📌 Định nghĩa cốt lõi
(Khái niệm này là gì trong 1-2 câu ngắn gọn)

## 🔍 Giải thích chi tiết
(Phân tích rõ ràng theo cấp độ được yêu cầu)

## 💡 Ví dụ minh họa
(Tình huống thực tế hoặc bài toán cụ thể)

## ✅ Tổng kết
(Câu chốt để ghi nhớ lâu dài)

BẮT ĐẦU:`;

  return await callOllama(prompt, { temperature: 0.6, num_predict: 1500 });
};

/**
 * Hỗ trợ giải bài tập chi tiết từng bước
 * @param {string} problemText - Đề bài
 * @param {string} subjectContext - Môn học liên quan
 */
const solveHomework = async (problemText, subjectContext = '') => {
  if (!problemText || !problemText.trim()) {
    throw new Error('Vui lòng nhập nội dung đề bài tập.');
  }

  const prompt = `Bạn là Giáo sư kiêm Trợ lý giải bài tập EduMind AI.

Môn học: ${subjectContext || 'Khoa học kỹ thuật / Đại cương'}
--- ĐỀ BÀI ---
${problemText.trim()}
--------------

HƯỚNG DẪN GIẢI (Markdown tiếng Việt):
## 📋 Phân tích đề bài
(Tóm tắt dữ kiện đã cho và điều cần tìm)

## 📐 Kiến thức & Công thức áp dụng
(Nêu rõ định lý, công thức, thuật toán cần dùng)

## 🔢 Các bước giải chi tiết
- **Bước 1:** ...
- **Bước 2:** ...
- **Bước 3:** ...

## ✅ Đáp số
(Kết quả cuối cùng, in đậm rõ ràng)

## 💡 Kiểm tra & Mẹo nhớ
(Cách kiểm tra kết quả và lưu ý tránh sai)

BẮT ĐẦU GIẢI:`;

  return await callOllama(prompt, { temperature: 0.4, num_predict: 1500 });
};

/**
 * Sinh kế hoạch học tập cá nhân hóa (Study Plan)
 */
const generateStudyPlan = async ({ subjectName, goal, durationDays = 7, hoursPerDay = 2, currentLevel = 'Cơ bản' }) => {
  const prompt = `Bạn là Cố vấn Học tập AI cao cấp. Hãy lập Kế Hoạch Học Tập tối ưu:

- Môn học: ${subjectName}
- Mục tiêu: ${goal || 'Nắm vững kiến thức và đạt điểm cao'}
- Thời gian: ${durationDays} ngày
- Thời lượng: ${hoursPerDay} giờ/ngày
- Trình độ: ${currentLevel}

QUAN TRỌNG: Chỉ trả về JSON hợp lệ theo cấu trúc này, không thêm bất kỳ văn bản nào ngoài JSON:
{
  "title": "Lộ trình ôn tập ${subjectName} trong ${durationDays} ngày",
  "overview": "Mô tả chiến lược học tập",
  "days": [
    {
      "day": 1,
      "theme": "Chủ đề ngày 1",
      "tasks": ["Nhiệm vụ 1", "Nhiệm vụ 2", "Nhiệm vụ 3"],
      "estimatedHours": ${hoursPerDay}
    }
  ],
  "tips": ["Lời khuyên 1", "Lời khuyên 2", "Lời khuyên 3"]
}`;

  const rawText = await callOllama(prompt, { temperature: 0.5, num_predict: 2048 });
  return extractCleanJSON(rawText);
};

/**
 * Sinh 5 câu hỏi trắc nghiệm từ nội dung tài liệu
 */
const generateQuiz = async (textContext) => {
  if (!textContext || textContext.trim().length === 0) {
    throw new Error('Tài liệu không có nội dung để tạo bài trắc nghiệm.');
  }

  const contextSnippet = textContext.slice(0, 10000);

  const prompt = `Dựa vào nội dung tài liệu sau, tạo 5 câu hỏi trắc nghiệm ôn tập:

--- NỘI DUNG ---
${contextSnippet}
----------------

QUAN TRỌNG: Chỉ trả về mảng JSON hợp lệ, không thêm văn bản nào khác:
[
  {
    "question": "Câu hỏi 1?",
    "options": ["A. Lựa chọn 1", "B. Lựa chọn 2", "C. Lựa chọn 3", "D. Lựa chọn 4"],
    "answer": "A",
    "explanation": "Giải thích tại sao đáp án A đúng."
  }
]

Tạo đúng 5 câu, bắt đầu trả lời với dấu [:`;

  const rawText = await callOllama(prompt, { temperature: 0.6, num_predict: 2048 });
  return extractCleanJSON(rawText);
};

const generateEssayQuiz = async (textContext, count = 5, difficulty = 'trung bình') => {
  if (!textContext || !textContext.trim()) {
    throw new Error('Tài liệu không có nội dung để tạo câu hỏi tự luận.');
  }
  const prompt = `Dựa duy nhất vào tài liệu dưới đây, tạo ${count} câu hỏi tự luận ${difficulty}.
Mỗi câu gồm question, referenceAnswer, rubric (mảng tiêu chí chấm), difficulty.
Chỉ trả về JSON hợp lệ dạng {"questions":[...]} bằng tiếng Việt.
Tài liệu:
${textContext.slice(0, 10000)}`;
  const raw = await callOllama(prompt, { temperature: 0.4, num_predict: 2500 });
  const result = extractCleanJSON(raw);
  const questions = Array.isArray(result) ? result : result.questions;
  if (!Array.isArray(questions) || !questions.length ||
      questions.some((item) => !item.question || !item.referenceAnswer || !Array.isArray(item.rubric))) {
    throw new Error('AI trả về bộ câu hỏi tự luận không đúng định dạng.');
  }
  return questions;
};

const gradeEssayAnswer = async ({ question, referenceAnswer, rubric, answer }) => {
  if (!answer || !answer.trim()) throw new Error('Vui lòng nhập câu trả lời.');
  const prompt = `Chấm câu trả lời tự luận dựa trên đáp án tham khảo và tiêu chí. Chấm công bằng, không bịa kiến thức.
Chỉ trả về JSON hợp lệ: {"score":number,"maxScore":number,"feedback":"...","criterionResults":[{"criterion":"...","score":number,"feedback":"..."}]}
Câu hỏi: ${question}
Đáp án tham khảo: ${referenceAnswer}
Tiêu chí: ${JSON.stringify(rubric)}
Câu trả lời của sinh viên: ${answer}`;
  const raw = await callOllama(prompt, { temperature: 0.1, num_predict: 1200 });
  const result = extractCleanJSON(raw);
  if (!Number.isFinite(Number(result.score)) || !Number.isFinite(Number(result.maxScore)) ||
      Number(result.score) < 0 || Number(result.maxScore) <= 0 ||
      Number(result.score) > Number(result.maxScore) || typeof result.feedback !== 'string') {
    throw new Error('AI trả về kết quả chấm điểm không hợp lệ.');
  }
  return result;
};

/**
 * Sinh 6 thẻ ghi nhớ (Flashcards) từ tài liệu
 */
const generateFlashcards = async (textContext) => {
  if (!textContext || textContext.trim().length === 0) {
    throw new Error('Tài liệu không có nội dung để tạo thẻ ghi nhớ.');
  }

  const contextSnippet = textContext.slice(0, 10000);

  const prompt = `Từ nội dung tài liệu sau, trích xuất 6 khái niệm/thuật ngữ then chốt tạo Flashcard:

--- NỘI DUNG ---
${contextSnippet}
----------------

QUAN TRỌNG: Chỉ trả về mảng JSON hợp lệ, không thêm văn bản nào khác:
[
  {
    "front": "Thuật ngữ hoặc câu hỏi",
    "back": "Định nghĩa hoặc giải thích chi tiết",
    "hint": "Gợi ý ngắn gọn để nhớ"
  }
]

Tạo đúng 6 thẻ, bắt đầu trả lời với dấu [:`;

  const rawText = await callOllama(prompt, { temperature: 0.5, num_predict: 1500 });
  return extractCleanJSON(rawText);
};

// ============================================================
// EXPORT
// ============================================================
module.exports = {
  extractTextFromPDF,
  extractTextFromDOCX,
  summarizeText,
  askAI,
  answerWithContext,
  explainConcept,
  solveHomework,
  generateStudyPlan,
  generateQuiz,
  generateEssayQuiz,
  gradeEssayAnswer,
  generateFlashcards,
  checkOllamaHealth,
  checkAiHealth,
  createEmbedding,
  createEmbeddings,
  ocrPDF,
  OLLAMA_MODEL,
  OLLAMA_BASE_URL,
  OLLAMA_EMBEDDING_MODEL,
  AI_SERVICE_URL,
};
