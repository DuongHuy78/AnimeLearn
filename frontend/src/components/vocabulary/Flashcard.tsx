import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Định nghĩa kiểu dữ liệu cho một từ vựng trong Flashcard
export interface FlashcardWord {
  id: string | number;
  word: string;
  reading?: string;
  meaning_vi?: string;
  meaning_en?: string;
  jlpt_level?: string;
  example_sentence?: string;
  example_meaning?: string;
  audio_url?: string;
  is_mastered?: boolean;
  ease_factor?: number;
  review_interval?: number;
  review_count?: number;
  next_review_date?: string | Date;
  tags?: string[];
}

// Định nghĩa Props truyền vào component
interface FlashCardProps {
  words: FlashcardWord[];
  onReview: (payload: { id: string | number; data: any }) => void;
}

// Hàm tính toán Spaced Repetition
function calculateNextReview(quality: number, easeFactor: number, interval: number) {
  let newEase = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  newEase = Math.max(1.3, newEase);

  let newInterval;
  if (quality < 2) {
    newInterval = 1; // Again
  } else if (quality === 2) {
    newInterval = Math.max(1, Math.round(interval * 1.2)); // Hard
  } else if (quality === 3) {
    newInterval = Math.max(1, Math.round(interval * newEase)); // Good
  } else {
    newInterval = Math.max(1, Math.round(interval * newEase * 1.3)); // Easy
  }

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + newInterval);

  return {
    ease_factor: newEase,
    review_interval: newInterval,
    next_review_date: nextDate.toISOString().split('T')[0],
    review_count: 1
  };
}

export default function FlashCard({ words, onReview }: FlashCardProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const word = words[currentIdx];
  if (!word) return null;

  const handleReview = (quality: number) => {
    const result = calculateNextReview(quality, word.ease_factor || 2.5, word.review_interval || 1);
    onReview({ id: word.id, data: { ...result, review_count: (word.review_count || 0) + 1 } });

    setFlipped(false);
    if (currentIdx < words.length - 1) {
      setCurrentIdx(currentIdx + 1);
    }
  };

  const displayMeaning = word.meaning_en || word.meaning_vi || "Meaning not available";
  const displayTags = word.tags || ["Noun", "Suru-Verb"]; // Mock tags if none exist

  return (
    <div className="max-w-2xl mx-auto w-full">
      {/* Progress Bar */}
      <div className="w-full max-w-md mx-auto mb-8">
        <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-[#4f46e5] rounded-full transition-all duration-300"
            style={{ width: `${((currentIdx) / Math.max(words.length, 1)) * 100}%` }}
          />
        </div>
        <div className="text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          {currentIdx} / {words.length} cards completed
        </div>
      </div>

      <div
        className="relative cursor-pointer mb-8"
        onClick={() => !flipped && setFlipped(true)}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={flipped ? 'back' : 'front'}
            initial={{ rotateY: 90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: -90, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="min-h-[420px] rounded-[2rem] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex flex-col items-center justify-center p-10 relative"
          >
            {/* Volume Icon */}
            <Volume2 className="w-7 h-7 text-[#005537] absolute top-8 right-8 hover:opacity-80 transition-opacity" onClick={(e) => e.stopPropagation()} />

            {!flipped ? (
              // FRONT OF CARD
              <>
                {word.reading && (
                  <span className="px-4 py-1 bg-blue-50 text-blue-600 font-bold rounded-full text-sm mb-6">
                    {word.reading}
                  </span>
                )}
                <h2 className="text-7xl font-bold text-[#005537] mb-8">{word.word}</h2>
                <p className="text-sm font-medium text-slate-400 mt-4 animate-pulse">Tap to flip</p>
              </>
            ) : (
              // BACK OF CARD
              <>
                {word.reading && (
                  <span className="px-4 py-1 bg-blue-50 text-blue-600 font-bold rounded-full text-sm mb-5">
                    {word.reading}
                  </span>
                )}

                <h2 className="text-6xl font-bold text-[#005537] mb-6">{word.word}</h2>

                <div className="w-16 h-px bg-slate-200 mb-6" />

                <h3 className="text-2xl font-bold text-slate-800 mb-4 text-center">
                  {displayMeaning}
                </h3>

                {word.example_meaning && (
                  <p className="text-slate-500 italic mb-2 text-center text-sm md:text-base">
                    "{word.example_meaning}"
                  </p>
                )}

                {word.example_sentence && (
                  <p className="text-slate-600 font-medium mb-10 text-center text-sm md:text-base">
                    {word.example_sentence}
                  </p>
                )}

                <div className="flex gap-2 mt-auto">
                  {displayTags.map((tag, i) => (
                    <span key={i} className="px-4 py-1.5 bg-slate-100 text-slate-500 font-bold text-xs rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Action Buttons Container */}
      <div className="h-24 relative">
        <AnimatePresence>
          {flipped && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-4 gap-4 absolute w-full"
            >
              <button
                onClick={(e) => { e.stopPropagation(); handleReview(1); }}
                className="flex flex-col items-center justify-center py-4 bg-[#fff1f2] text-red-600 border border-red-100 rounded-2xl hover:bg-red-100 transition-colors"
              >
                <span className="font-bold text-base mb-1">Again</span>
                <span className="text-sm font-medium opacity-80">&lt; 1m</span>
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); handleReview(2); }}
                className="flex flex-col items-center justify-center py-4 bg-[#eff6ff] text-blue-600 border border-blue-200 rounded-2xl hover:bg-blue-100 transition-colors"
              >
                <span className="font-bold text-base mb-1">Hard</span>
                <span className="text-sm font-medium opacity-80">{Math.round((word.review_interval || 1) * 1.2)}d</span>
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); handleReview(3); }}
                className="flex flex-col items-center justify-center py-4 bg-[#ecfdf5] text-emerald-700 border border-emerald-100 rounded-2xl hover:bg-emerald-100 transition-colors"
              >
                <span className="font-bold text-base mb-1">Good</span>
                <span className="text-sm font-medium opacity-80">{Math.round((word.review_interval || 1) * (word.ease_factor || 2.5))}d</span>
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); handleReview(4); }}
                className="flex flex-col items-center justify-center py-4 bg-[#f0fdf4] text-[#005537] border border-[#dcfce7] rounded-2xl hover:bg-[#dcfce7] transition-colors"
              >
                <span className="font-bold text-base mb-1">Easy</span>
                <span className="text-sm font-medium opacity-80">{Math.round((word.review_interval || 1) * (word.ease_factor || 2.5) * 1.3)}d</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation - keeping this subtle or hidden since the buttons handle progression */}
      {!flipped && (
        <div className="flex items-center justify-center gap-4 mt-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); setCurrentIdx(Math.max(0, currentIdx - 1)); setFlipped(false); }}
            disabled={currentIdx === 0}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); setCurrentIdx(Math.min(words.length - 1, currentIdx + 1)); setFlipped(false); }}
            disabled={currentIdx === words.length - 1}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"
          >
            <ChevronRight className="w-6 h-6" />
          </Button>
        </div>
      )}
    </div>
  );
}