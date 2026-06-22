import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import YouTubeOrigin from 'react-youtube';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ChevronLeft,
  Clock,
  ListChecks,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  TimerReset,
  Trophy,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { quizApi } from '@/api/quiz.api';

const YouTube = (YouTubeOrigin as any).default || YouTubeOrigin;

type ScriptLine = {
  timestamp?: string;
  start?: number;
  start_time?: number;
  startTimeSeconds?: number;
  end?: number;
  end_time?: number;
  endTimeSeconds?: number;
  japanese?: string;
  vietnamese?: string;
};

export interface QuizQuestion {
  timestamp: string;
  startTimeSeconds?: number;
  endTimeSeconds?: number;
  type: string;
  questionText: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface QuizData {
  id: string;
  videoId: string;
  questions: QuizQuestion[];
}

interface QuizPageProps {
  videoId?: string | null;
  script?: ScriptLine[];
  ytId?: string | null;
}

function parseTimestampToSeconds(value?: string | number | null): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (!value || typeof value !== 'string') return 0;

  const trimmed = value.trim();
  if (!trimmed) return 0;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.max(0, Number(trimmed));

  const parts = trimmed.split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 2) return Math.max(0, parts[0] * 60 + parts[1]);
  if (parts.length === 3) return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  return 0;
}

function formatTime(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(value || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${String(hours).padStart(2, '0')}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

function getQuestionStart(question?: QuizQuestion): number {
  if (!question) return 0;
  if (typeof question.startTimeSeconds === 'number') return Math.max(0, question.startTimeSeconds);
  return parseTimestampToSeconds(question.timestamp);
}

function getQuestionEnd(question: QuizQuestion | undefined, questions: QuizQuestion[], index: number): number {
  if (!question) return 0;
  const start = getQuestionStart(question);
  if (typeof question.endTimeSeconds === 'number' && question.endTimeSeconds > start) {
    return question.endTimeSeconds;
  }

  const nextStart = getQuestionStart(questions[index + 1]);
  if (nextStart > start) return nextStart;
  return start + 30;
}

function getScriptDuration(script: ScriptLine[]): number {
  if (!Array.isArray(script) || script.length === 0) return 0;

  return script.reduce((maxDuration, line, index) => {
    const start = parseTimestampToSeconds(line.startTimeSeconds ?? line.start_time ?? line.start ?? line.timestamp);
    const explicitEnd = parseTimestampToSeconds(line.endTimeSeconds ?? line.end_time ?? line.end);
    const next = script[index + 1];
    const nextStart = next
      ? parseTimestampToSeconds(next.startTimeSeconds ?? next.start_time ?? next.start ?? next.timestamp)
      : 0;
    const end = explicitEnd > start ? explicitEnd : nextStart > start ? nextStart : start + 6;
    return Math.max(maxDuration, end, start);
  }, 0);
}

function getQuestionTypeLabel(type: string): string {
  switch (type) {
    case 'fill_in_blank':
      return 'Điền chỗ trống';
    case 'vocabulary':
      return 'Từ vựng';
    case 'translation':
      return 'Dịch nghĩa';
    case 'grammar_particle':
      return 'Ngữ pháp';
    case 'kanji_reading':
      return 'Đọc Kanji';
    case 'sentence_reorder':
      return 'Sắp xếp câu';
    case 'context_comprehension':
      return 'Hiểu ngữ cảnh';
    case 'expression_intent':
      return 'Ý định câu nói';
    case 'inference':
      return 'Suy luận';
    case 'conjugation':
      return 'Chia thể';
    case 'polite_casual':
      return 'Sắc thái';
    case 'counter_word':
      return 'Lượng từ';
    default:
      return 'Trắc nghiệm';
  }
}

export default function QuizPage({ videoId = null, script = [], ytId }: QuizPageProps) {
  const queryClient = useQueryClient();
  const playerRef = useRef<any>(null);

  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [quizDone, setQuizDone] = useState(false);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [isSegmentPlaying, setIsSegmentPlaying] = useState(false);

  const { data: existingQuiz, isLoading: isFetchingQuiz } = useQuery<QuizData | null>({
    queryKey: ['video-quiz', videoId],
    queryFn: async () => {
      if (!videoId) return null;
      return quizApi.getQuizByVideoId<QuizData>(videoId);
    },
    enabled: !!videoId,
  });

  const generateQuizMutation = useMutation({
    mutationFn: async () => {
      if (!videoId) throw new Error('Thiếu mã video');
      if (!script || script.length === 0) throw new Error('Video chưa có script để tạo quiz.');

      return quizApi.generateQuiz<{ message?: string; quiz: QuizData; jlptLevel?: string }>(videoId, { script });
    },
    onSuccess: (data) => {
      toast.success(`AI đã tạo quiz${data.jlptLevel ? ` và đánh giá trình độ ${data.jlptLevel}` : ''}.`);
      queryClient.invalidateQueries({ queryKey: ['video-quiz', videoId] });
      queryClient.invalidateQueries({ queryKey: ['community-videos'] });
      queryClient.invalidateQueries({ queryKey: ['video-detail', videoId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Không thể tạo quiz lúc này');
    },
  });

  const questions = existingQuiz?.questions ?? [];
  const q = questions[currentQ];
  const selectedOption = answers[currentQ];
  const showResult = selectedOption !== undefined;
  const answeredCount = Object.keys(answers).length;
  const estimatedQuestionCount = Math.max(1, Math.floor(getScriptDuration(script) / 30) || 1);

  const score = useMemo(() => {
    return questions.reduce((total, question, index) => (
      answers[index] === question.correctAnswerIndex ? total + 1 : total
    ), 0);
  }, [answers, questions]);

  const segmentStart = getQuestionStart(q);
  const segmentEnd = getQuestionEnd(q, questions, currentQ);
  const timelineDuration = Math.max(
    playerDuration,
    getScriptDuration(script),
    ...questions.map((question, index) => getQuestionEnd(question, questions, index)),
    segmentEnd,
    1,
  );
  const segmentLeft = Math.min(100, Math.max(0, (segmentStart / timelineDuration) * 100));
  const segmentWidth = Math.max(2, Math.min(100 - segmentLeft, ((segmentEnd - segmentStart) / timelineDuration) * 100));

  const seekToQuestionStart = useCallback((play = true, targetQuestion = q) => {
    if (!targetQuestion || !playerRef.current) return;

    const start = getQuestionStart(targetQuestion);
    playerRef.current.seekTo?.(start, true);

    if (play) {
      playerRef.current.playVideo?.();
      setIsSegmentPlaying(true);
    } else {
      playerRef.current.pauseVideo?.();
      setIsSegmentPlaying(false);
    }
  }, [q]);

  useEffect(() => {
    if (!q || !playerRef.current) return;
    seekToQuestionStart(true);
  }, [currentQ, q, seekToQuestionStart]);

  useEffect(() => {
    if (!isSegmentPlaying || !q || !playerRef.current) return undefined;

    const intervalId = window.setInterval(async () => {
      const currentTime = await playerRef.current?.getCurrentTime?.();
      if (typeof currentTime === 'number' && currentTime >= segmentEnd - 0.1) {
        playerRef.current?.pauseVideo?.();
        setIsSegmentPlaying(false);
      }
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [isSegmentPlaying, q, segmentEnd]);

  const handleStartQuiz = () => {
    setCurrentQ(0);
    setAnswers({});
    setQuizDone(false);
    setIsSegmentPlaying(false);
  };

  const handleAnswer = (optionIndex: number) => {
    setAnswers(prev => {
      if (prev[currentQ] !== undefined) return prev;
      return { ...prev, [currentQ]: optionIndex };
    });
  };

  const goToQuestion = (index: number) => {
    if (index < 0 || index >= questions.length) return;
    seekToQuestionStart(true, questions[index]);
    setCurrentQ(index);
    setQuizDone(false);
  };

  const nextQuestion = () => {
    if (currentQ < questions.length - 1) {
      goToQuestion(currentQ + 1);
      return;
    }
    setQuizDone(true);
  };

  const previousQuestion = () => {
    goToQuestion(currentQ - 1);
  };

  if (!videoId) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center bg-slate-50 p-6 text-center text-slate-600">
        Vui lòng lưu video và script trước khi tạo quiz.
      </div>
    );
  }

  if (isFetchingQuiz) {
    return (
      <div className="flex h-full min-h-[520px] flex-col items-center justify-center bg-slate-50 p-6 text-slate-600">
        <Loader2 className="mb-4 h-8 w-8 animate-spin text-emerald-600" />
        <p className="text-sm font-semibold">Đang kiểm tra quiz của video...</p>
      </div>
    );
  }

  if (!existingQuiz && !generateQuizMutation.isPending) {
    return (
      <div className="flex h-full min-h-[560px] items-center justify-center bg-slate-50 p-4 md:p-6">
        <section className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <BrainCircuit className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-950">Tạo quiz từ video</h2>
              <p className="text-sm text-slate-500">Mỗi 30 giây video sẽ có một câu quiz.</p>
            </div>
          </div>

          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Ước tính</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">{estimatedQuestionCount}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Nguồn</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">{script.length}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Dạng câu</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">12</p>
            </div>
          </div>

          <Button
            disabled={!script || script.length === 0}
            className="h-11 w-full rounded-lg bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700 sm:w-auto"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Chức năng tạo quiz bị disable do không đủ chi phí, hãy làm quiz ở video có sẵn quiz
          </Button>

          {(!script || script.length === 0) && (
            <p className="mt-4 text-sm font-medium text-rose-600">Cần tạo script ở tab Luyện Shadowing trước.</p>
          )}
        </section>
      </div>
    );
  }

  if (generateQuizMutation.isPending) {
    return (
      <div className="flex h-full min-h-[560px] items-center justify-center bg-slate-50 p-4 md:p-6">
        <section className="flex w-full max-w-2xl flex-col items-center rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm md:p-12">
          <Loader2 className="mb-5 h-12 w-12 animate-spin text-emerald-600" />
          <h2 className="text-xl font-bold text-slate-950">AI đang tạo quiz</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
            Hệ thống đang chia video theo từng đoạn 30 giây và chọn kiểu câu hỏi phù hợp.
          </p>
        </section>
      </div>
    );
  }

  if (quizDone && existingQuiz) {
    const percent = Math.round((score / Math.max(1, questions.length)) * 100);

    return (
      <div className="flex h-full min-h-[560px] items-center justify-center bg-slate-50 p-4 md:p-6">
        <motion.section
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm md:p-8"
        >
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
            <Trophy className="h-7 w-7" />
          </div>
          <h2 className="text-2xl font-bold text-slate-950">Kết quả của bạn</h2>
          <p className="mt-3 text-5xl font-black text-slate-950">
            {score}<span className="text-2xl text-slate-400">/{questions.length}</span>
          </p>
          <p className="mt-3 text-sm font-semibold text-slate-600">{percent}% hoàn thành chính xác</p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Button onClick={handleStartQuiz} className="h-11 rounded-lg bg-emerald-600 px-5 font-bold text-white hover:bg-emerald-700">
              <RotateCcw className="mr-2 h-4 w-4" />
              Làm lại
            </Button>
            <Button onClick={() => setQuizDone(false)} variant="outline" className="h-11 rounded-lg px-5 font-bold">
              Xem lại câu hỏi
            </Button>
          </div>
        </motion.section>
      </div>
    );
  }

  if (!q || !existingQuiz) return null;

  return (
    <div className="h-full min-h-[620px] overflow-y-auto bg-slate-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 md:p-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-md border-0 bg-emerald-100 px-2.5 py-1 text-emerald-800">
                Câu {currentQ + 1}/{questions.length}
              </Badge>
              <Badge variant="outline" className="rounded-md border-slate-200 bg-white px-2.5 py-1 text-slate-700">
                {score} điểm
              </Badge>
              <Badge variant="outline" className="rounded-md border-slate-200 bg-white px-2.5 py-1 text-slate-700">
                {answeredCount}/{questions.length} đã trả lời
              </Badge>
            </div>
            <div className="mt-3 h-2 w-full max-w-xl overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }}
              />
            </div>
          </div>

          <Button onClick={() => seekToQuestionStart(true)} variant="outline" className="h-10 rounded-lg border-slate-300 bg-white font-bold">
            <TimerReset className="mr-2 h-4 w-4" />
            Replay đoạn
          </Button>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(320px,0.95fr)_minmax(0,1.05fr)]">
          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="relative aspect-video overflow-hidden rounded-t-lg bg-slate-950">
              {ytId ? (
                <YouTube
                  videoId={ytId}
                  className="absolute inset-0 h-full w-full"
                  iframeClassName="h-full w-full border-0"
                  opts={{ playerVars: { autoplay: 0, controls: 1, rel: 0 } }}
                  onReady={(event: any) => {
                    playerRef.current = event.target;
                    const duration = event.target.getDuration?.();
                    if (typeof duration === 'number' && duration > 0) setPlayerDuration(duration);
                    event.target.seekTo?.(segmentStart, true);
                    event.target.playVideo?.();
                    setIsSegmentPlaying(true);
                  }}
                  onStateChange={(event: any) => {
                    if (event.data === 2 || event.data === 0) setIsSegmentPlaying(false);
                  }}
                />
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm font-semibold text-slate-300">
                  Video chưa sẵn sàng
                </div>
              )}

              <div className="pointer-events-none absolute left-3 right-3 top-3 rounded-lg border border-emerald-300/60 bg-slate-950/75 p-3 text-white shadow-lg backdrop-blur">
                <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-emerald-300" />
                    Vùng quiz
                  </span>
                  <span className="font-mono">{formatTime(segmentStart)} - {formatTime(segmentEnd)}</span>
                </div>
                <div className="relative h-2 overflow-hidden rounded-full bg-white/20">
                  <div
                    className="absolute top-0 h-full rounded-full bg-emerald-400"
                    style={{ left: `${segmentLeft}%`, width: `${segmentWidth}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 p-4">
              <div>
                <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>{formatTime(0)}</span>
                  <span>{formatTime(timelineDuration)}</span>
                </div>
                <div className="relative h-3 rounded-full bg-slate-200">
                  <div
                    className="absolute top-0 h-3 rounded-full bg-emerald-500"
                    style={{ left: `${segmentLeft}%`, width: `${segmentWidth}%` }}
                  />
                  {questions.map((question, index) => {
                    const left = Math.min(100, Math.max(0, (getQuestionStart(question) / timelineDuration) * 100));
                    const answered = answers[index] !== undefined;
                    return (
                      <button
                        key={`${question.timestamp}-${index}`}
                        type="button"
                        aria-label={`Câu ${index + 1}`}
                        title={`Câu ${index + 1}`}
                        onClick={() => goToQuestion(index)}
                        className={`absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-colors ${
                          index === currentQ
                            ? 'border-emerald-700 bg-white'
                            : answered
                              ? 'border-emerald-500 bg-emerald-500'
                              : 'border-white bg-slate-400'
                        }`}
                        style={{ left: `${left}%` }}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => seekToQuestionStart(true)} className="h-10 rounded-lg bg-slate-900 px-4 font-bold text-white hover:bg-slate-800">
                  <Play className="mr-2 h-4 w-4" />
                  Replay
                </Button>
                <Badge variant="outline" className="rounded-md border-slate-200 px-2.5 py-1 font-mono text-slate-700">
                  {formatTime(segmentEnd - segmentStart)}
                </Badge>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
                  <ListChecks className="h-4 w-4 text-emerald-600" />
                  Danh sách câu
                </div>
                <div className="grid grid-cols-8 gap-2 sm:grid-cols-10 lg:grid-cols-8">
                  {questions.map((question, index) => {
                    const answered = answers[index] !== undefined;
                    return (
                      <button
                        key={`${question.type}-${index}`}
                        type="button"
                        onClick={() => goToQuestion(index)}
                        className={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-bold transition-colors ${
                          index === currentQ
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : answered
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        {index + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <AnimatePresence mode="wait">
            <motion.section
              key={currentQ}
              initial={{ x: 18, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -18, opacity: 0 }}
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:p-6"
            >
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <Badge className="rounded-md border-0 bg-sky-100 px-2.5 py-1 text-sky-800">
                  {getQuestionTypeLabel(q.type)}
                </Badge>
                <Badge variant="outline" className="rounded-md border-slate-200 px-2.5 py-1 font-mono text-slate-700">
                  {formatTime(segmentStart)} - {formatTime(segmentEnd)}
                </Badge>
              </div>

              <h3
                className="mb-5 break-words text-xl font-bold leading-8 text-slate-950 md:text-2xl md:leading-9"
                dangerouslySetInnerHTML={{ __html: q.questionText }}
              />

              <div className="grid gap-3">
                {q.options.map((option, index) => {
                  const isCorrect = index === q.correctAnswerIndex;
                  const isSelected = index === selectedOption;

                  return (
                    <button
                      key={`${option}-${index}`}
                      type="button"
                      onClick={() => handleAnswer(index)}
                      disabled={showResult}
                      className={`w-full rounded-lg border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                        showResult
                          ? isCorrect
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                            : isSelected
                              ? 'border-rose-400 bg-rose-50 text-rose-900'
                              : 'border-slate-200 bg-slate-50 text-slate-500'
                          : 'border-slate-200 bg-white text-slate-800 hover:border-emerald-300 hover:bg-emerald-50/60'
                      }`}
                    >
                      <span className="flex items-start gap-3">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-black ${
                          showResult && isCorrect
                            ? 'bg-emerald-600 text-white'
                            : showResult && isSelected
                              ? 'bg-rose-600 text-white'
                              : 'bg-slate-100 text-slate-600'
                        }`}>
                          {String.fromCharCode(65 + index)}
                        </span>
                        <span className="min-w-0 flex-1 break-words text-base font-semibold leading-7">{option}</span>
                        {showResult && isCorrect && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />}
                        {showResult && isSelected && !isCorrect && <XCircle className="h-5 w-5 shrink-0 text-rose-600" />}
                      </span>
                    </button>
                  );
                })}
              </div>

              {showResult && (
                <motion.div
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-slate-800"
                >
                  <span className="mb-1 flex items-center gap-2 font-bold text-amber-800">
                    <Sparkles className="h-4 w-4" />
                    Giải thích
                  </span>
                  {q.explanation}
                </motion.div>
              )}

              <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  onClick={previousQuestion}
                  disabled={currentQ === 0}
                  variant="outline"
                  className="h-11 rounded-lg border-slate-300 bg-white font-bold"
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Câu trước
                </Button>

                <Button
                  onClick={nextQuestion}
                  disabled={!showResult}
                  className="h-11 rounded-lg bg-emerald-600 px-5 font-bold text-white hover:bg-emerald-700"
                >
                  {currentQ < questions.length - 1 ? 'Câu tiếp theo' : 'Xem kết quả'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.section>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
