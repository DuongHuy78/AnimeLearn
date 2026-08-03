const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_QUIZ_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const QUESTION_TYPES = [
  'fill_in_blank',
  'vocabulary',
  'translation',
  'grammar_particle',
  'kanji_reading',
  'sentence_reorder',
  'context_comprehension',
  'expression_intent',
  'inference',
  'conjugation',
  'polite_casual',
  'counter_word',
];

const FALLBACK_OPTIONS = [
  'Dung voi noi dung trong doan nay',
  'Khong dung voi noi dung trong doan nay',
  'Chi dung o mot doan khac',
  'Khong du thong tin de ket luan',
];

function parseTimestampToSeconds(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value !== 'string') return 0;

  const trimmed = value.trim();
  if (!trimmed) return 0;

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.max(0, Number(trimmed));
  }

  const parts = trimmed.split(':').map(part => Number(part));
  if (parts.some(part => Number.isNaN(part))) return 0;

  if (parts.length === 2) return Math.max(0, parts[0] * 60 + parts[1]);
  if (parts.length === 3) return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  return 0;
}

function getSegmentStart(segment) {
  if (!segment || typeof segment !== 'object') return 0;
  const candidates = [
    segment.startTimeSeconds,
    segment.start_time,
    segment.startTime,
    segment.start,
    segment.timestamp,
  ];

  for (const candidate of candidates) {
    const seconds = parseTimestampToSeconds(candidate);
    if (seconds > 0 || candidate === 0 || candidate === '0' || candidate === '00:00') return seconds;
  }

  return 0;
}

function getSegmentEnd(segment, nextSegment) {
  if (!segment || typeof segment !== 'object') return 0;
  const candidates = [
    segment.endTimeSeconds,
    segment.end_time,
    segment.endTime,
    segment.end,
  ];

  for (const candidate of candidates) {
    const seconds = parseTimestampToSeconds(candidate);
    if (seconds > 0) return seconds;
  }

  const nextStart = nextSegment ? getSegmentStart(nextSegment) : 0;
  if (nextStart > getSegmentStart(segment)) return nextStart;

  return getSegmentStart(segment) + 6;
}

function formatSecondsAsTimestamp(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${String(hours).padStart(2, '0')}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

function inferDurationFromScript(script) {
  if (!Array.isArray(script) || script.length === 0) return 0;

  return script.reduce((maxSeconds, segment, index) => {
    const end = getSegmentEnd(segment, script[index + 1]);
    const start = getSegmentStart(segment);
    return Math.max(maxSeconds, end, start);
  }, 0);
}

function normalizeTranscriptSegments(script) {
  if (!Array.isArray(script)) return [];

  return script
    .map((segment, index) => {
      const start = getSegmentStart(segment);
      const rawEnd = getSegmentEnd(segment, script[index + 1]);
      const end = rawEnd > start ? rawEnd : start + 6;
      const text = getSegmentText(segment);

      return {
        index,
        key: `${index}:${start}:${end}`,
        start,
        end,
        ...text,
      };
    })
    .filter(segment => segment.end > segment.start);
}

function hasLearningText(segment) {
  return Boolean(segment?.japanese || segment?.vietnamese || segment?.vocab);
}

function selectFocusSegment(segments, windowStart, windowEnd, usedKeys) {
  const midpoint = windowStart + ((windowEnd - windowStart) / 2);
  const overlapping = segments.filter(segment => (
    hasLearningText(segment) && segment.start < windowEnd && segment.end > windowStart
  ));
  const pool = overlapping.length
    ? overlapping
    : segments.filter(hasLearningText);

  if (!pool.length) {
    return {
      index: -1,
      key: `fallback:${windowStart}:${windowEnd}`,
      start: windowStart,
      end: Math.max(windowStart + 1, windowEnd),
      japanese: '',
      vietnamese: '',
      vocab: '',
    };
  }

  return [...pool].sort((a, b) => {
    const aUsed = usedKeys.has(a.key) ? 1 : 0;
    const bUsed = usedKeys.has(b.key) ? 1 : 0;
    if (aUsed !== bUsed) return aUsed - bUsed;

    const aMidpoint = a.start + ((a.end - a.start) / 2);
    const bMidpoint = b.start + ((b.end - b.start) / 2);
    return Math.abs(aMidpoint - midpoint) - Math.abs(bMidpoint - midpoint);
  })[0];
}

function buildContextSegments(segments, focus, windowStart, windowEnd) {
  if (!segments.length) return [focus];

  const byKey = new Map();
  segments
    .filter(segment => segment.start < windowEnd && segment.end > windowStart)
    .forEach(segment => byKey.set(segment.key, segment));

  segments
    .filter(segment => Math.abs(segment.index - focus.index) <= 1)
    .forEach(segment => byKey.set(segment.key, segment));

  byKey.set(focus.key, focus);

  return [...byKey.values()]
    .sort((a, b) => a.start - b.start)
    .slice(0, 6);
}

function buildQuizPlan(script, durationSeconds) {
  const inferredDuration = inferDurationFromScript(script);
  const providedDuration = Number(durationSeconds) || 0;
  const videoDuration = providedDuration > 0
    ? providedDuration
    : inferredDuration > 0
      ? inferredDuration
      : 30;
  const questionCount = Math.max(1, Math.floor(videoDuration / 30) || 1);
  const segments = normalizeTranscriptSegments(script);
  const usedKeys = new Set();

  return Array.from({ length: questionCount }, (_, index) => {
    const windowStartSeconds = index * 30;
    const windowEndSeconds = Math.min(windowStartSeconds + 30, videoDuration);
    const focus = selectFocusSegment(segments, windowStartSeconds, windowEndSeconds, usedKeys);
    usedKeys.add(focus.key);
    const startTimeSeconds = focus.start;
    const endTimeSeconds = Math.max(startTimeSeconds + 1, focus.end);

    return {
      order: index + 1,
      windowStartSeconds,
      windowEndSeconds,
      startTimeSeconds,
      endTimeSeconds,
      timestamp: formatSecondsAsTimestamp(startTimeSeconds),
      sourceScriptIndex: focus.index,
      contextSegments: buildContextSegments(segments, focus, windowStartSeconds, windowEndSeconds),
    };
  });
}

function getSegmentText(segment) {
  const japanese = String(segment?.japanese || segment?.line_jp || segment?.text || '').trim();
  const vietnamese = String(segment?.vietnamese || segment?.line_vn || segment?.translation || '').trim();
  const vocab = Array.isArray(segment?.vocabulary)
    ? segment.vocabulary
      .map(item => [item?.word, item?.reading, item?.meaning].filter(Boolean).join(' - '))
      .filter(Boolean)
      .join('; ')
    : '';

  return { japanese, vietnamese, vocab };
}

function buildSlotContext(slot) {
  const selected = Array.isArray(slot.contextSegments) ? slot.contextSegments : [];

  return selected.map(item => {
    const vocabText = item.vocab ? ` | Vocab: ${item.vocab}` : '';
    const marker = item.index === slot.sourceScriptIndex ? 'SOURCE ' : '';
    return `${marker}[${formatSecondsAsTimestamp(item.start)}-${formatSecondsAsTimestamp(item.end)}] JP: ${item.japanese} | VI: ${item.vietnamese}${vocabText}`;
  }).join('\n');
}

function buildPrompt(quizPlan) {
  const ranges = quizPlan.map(slot => (
    `Question ${slot.order}:
- Counting window for distribution only: ${formatSecondsAsTimestamp(slot.windowStartSeconds)}-${formatSecondsAsTimestamp(slot.windowEndSeconds)}
- Reference script timing to return: startTimeSeconds=${slot.startTimeSeconds}, endTimeSeconds=${slot.endTimeSeconds}, timestamp="${slot.timestamp}"
- Build the question primarily from the line marked SOURCE.
${buildSlotContext(slot) || 'No transcript text found in this range. Use nearest context from the script if needed.'}`
  )).join('\n\n');

  const typeList = QUESTION_TYPES.map(type => `"${type}"`).join(', ');

  return `You are an expert Japanese language teacher for Vietnamese learners.
Generate a text-based multiple-choice quiz from the provided video transcript ranges and determine the overall JLPT level.

Rules:
- Generate exactly ${quizPlan.length} questions. There is exactly 1 question for each planned range below.
- A video creates 1 quiz question per full 30 seconds. Example: a 130-second video creates 4 questions.
- The 30-second windows are only for counting and distribution. Do not use the window boundaries as the quiz timestamp.
- Each question must keep the exact startTimeSeconds, endTimeSeconds, and timestamp from the reference script timing below.
- Use the SOURCE script line as the main evidence. Nearby lines are only extra context.
- Questions must be text-based only.
- Rotate naturally across these question types: ${typeList}.
- Use varied question styles: vocabulary meaning, particle/grammar, blank fill, translation, kanji reading, sentence reorder, intent, inference, conjugation, politeness/casualness, counters.
- Provide exactly 4 options per question, only 1 correct answer.
- Randomize the position of the correct answer among the 4 options.
- Explain briefly in Vietnamese why the answer is correct.
- Determine the overall JLPT level. The value must be exactly one of: "N5", "N4", "N3", "N2", "N1".

Output valid JSON only, exactly in this shape:
{
  "jlptLevel": "N4",
  "questions": [
    {
      "timestamp": "00:17",
      "startTimeSeconds": 17.2,
      "endTimeSeconds": 21.8,
      "type": "vocabulary",
      "questionText": "Tu '約束' trong doan nay co nghia la gi?",
      "options": ["Cuoc hop", "Gia dinh", "Loi hua", "Ban be"],
      "correctAnswerIndex": 2,
      "explanation": "'約束' co nghia la loi hua hoac cuoc hen."
    }
  ]
}

Planned ranges and transcript context:
${ranges}`;
}

function parseGeminiJson(text) {
  if (!text) throw new Error('Gemini khong tra ve noi dung');

  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  return JSON.parse(cleaned);
}

function normalizeOptions(options) {
  const normalized = Array.isArray(options)
    ? options.map(option => String(option || '').trim()).filter(Boolean)
    : [];

  const merged = [...normalized, ...FALLBACK_OPTIONS];
  return merged.slice(0, 4);
}

function normalizeQuestion(question, slot, index) {
  const options = normalizeOptions(question?.options);
  const correctAnswerIndex = Number.isInteger(question?.correctAnswerIndex)
    && question.correctAnswerIndex >= 0
    && question.correctAnswerIndex < 4
    ? question.correctAnswerIndex
    : 0;

  const type = QUESTION_TYPES.includes(question?.type)
    ? question.type
    : QUESTION_TYPES[index % QUESTION_TYPES.length];

  return {
    timestamp: slot.timestamp,
    startTimeSeconds: slot.startTimeSeconds,
    endTimeSeconds: slot.endTimeSeconds,
    type,
    questionText: String(question?.questionText || `Chon nhan dinh dung voi doan ${slot.timestamp}.`).trim(),
    options,
    correctAnswerIndex,
    explanation: String(question?.explanation || 'Hay xem lai doan video duoc khoanh vung de doi chieu dap an.').trim(),
  };
}

function normalizeQuizResult(parsedJson, quizPlan) {
  const rawQuestions = Array.isArray(parsedJson?.questions) ? parsedJson.questions : [];
  const jlptLevel = ['N5', 'N4', 'N3', 'N2', 'N1'].includes(parsedJson?.jlptLevel)
    ? parsedJson.jlptLevel
    : 'Unknown';

  return {
    jlptLevel,
    questions: quizPlan.map((slot, index) => normalizeQuestion(rawQuestions[index], slot, index)),
  };
}

export const generateQuizFromScript = async (script, options = {}) => {
  try {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY chua duoc cau hinh');
    }

    if (!Array.isArray(script) || script.length === 0) {
      throw new Error('Script khong hop le hoac dang trong');
    }

    const quizPlan = buildQuizPlan(script, options.durationSeconds);
    const fullPrompt = buildPrompt(quizPlan);

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: fullPrompt }],
        }],
        generationConfig: {
          temperature: 0.35,
          responseMimeType: 'application/json',
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Loi tu API Gemini');

    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsedJson = parseGeminiJson(aiText);

    return normalizeQuizResult(parsedJson, quizPlan);
  } catch (error) {
    console.error('Loi khi tao Quiz bang AI:', error);
    throw error;
  }
};
