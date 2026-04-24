import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Loader2, BookOpen, Sparkles, CheckCircle2, Globe, Languages, Plus, ListFilter, Play, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import FlashCard, { type FlashcardWord } from '../components/vocabulary/Flashcard';
import VocabList, { type VocabItem } from '../components/vocabulary/VocalList';

// --- Các hàm tiện ích xử lý Storage (Mock Database) ---
const STORAGE_KEY = 'my_anime_saved_vocab';

const getVocabFromStorage = (): VocabItem[] => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return JSON.parse(stored);
  return [];
};

const saveVocabToStorage = (list: VocabItem[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
};

// --- Mock Data for Decks ---
const mockDecks = [
  {
    id: 'deck-1',
    title: 'Essential Kanji',
    description: 'Daily vocabulary for business contexts.',
    category: 'JAPANESE N2',
    icon: Globe,
    iconColor: 'text-[#005537]',
    iconBg: 'bg-[#dcfce7]',
    badgeBg: 'bg-[#dcfce7] text-[#005537]',
    mastery: 68,
    masteryColor: 'bg-[#8b5cf6]',
    stats: { new: 12, due: 45, total: 1240 },
    primaryAction: 'Study Now'
  },
  {
    id: 'deck-2',
    title: 'Common Phrases',
    description: 'Situational language for world explorers.',
    category: 'TRAVEL',
    icon: Languages,
    iconColor: 'text-[#005537]',
    iconBg: 'bg-[#dcfce7]',
    badgeBg: 'bg-[#dcfce7] text-[#005537]',
    mastery: 92,
    masteryColor: 'bg-[#8b5cf6]',
    stats: { new: 0, due: 0, total: 450 },
    primaryAction: 'Study Now'
  },
  {
    id: 'deck-3',
    title: 'Natsume Soseki',
    description: 'Vocabulary from "Kokoro" and "Botchan".',
    category: 'LITERATURE',
    icon: BookOpen,
    iconColor: 'text-[#005537]',
    iconBg: 'bg-[#dcfce7]',
    badgeBg: 'bg-[#dcfce7] text-[#005537]',
    mastery: 31,
    masteryColor: 'bg-[#8b5cf6]',
    stats: { new: 82, due: 12, total: 852 },
    primaryAction: 'Study Now'
  }
];

// --- Component Chính ---

export default function Vocabulary() {
  const queryClient = useQueryClient();
  const [activeDeck, setActiveDeck] = useState<string | null>(null);

  // 1. Query lấy danh sách từ vựng
  const { data: vocabulary = [], isLoading } = useQuery<VocabItem[]>({
    queryKey: ['vocabulary'],
    queryFn: async () => {
      await new Promise(r => setTimeout(r, 600)); // Giả lập delay cho mượt
      return getVocabFromStorage();
    },
    initialData: [],
  });

  // 2. Mutation cập nhật (sau khi review Flashcard)
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string | number; data: any }) => {
      await new Promise(r => setTimeout(r, 200));
      const current = getVocabFromStorage();
      const index = current.findIndex(v => v.id === id);
      if (index !== -1) {
        current[index] = { ...current[index], ...data };
        saveVocabToStorage(current);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vocabulary'] });
    },
  });

  // Lọc các từ đến hạn ôn tập (next_review_date <= hôm nay)
  const dueWords = vocabulary.filter((v: any) => {
    if (!v.next_review_date) return true;
    return new Date(v.next_review_date) <= new Date();
  });

  // Render Flashcard View
  if (activeDeck) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        <div className="mb-6">
          <button
            onClick={() => setActiveDeck(null)}
            className="text-emerald-700 font-semibold hover:text-emerald-800 flex items-center gap-2"
          >
            ← Back to Decks
          </button>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <Loader2 className="w-10 h-10 text-[#005537] animate-spin" />
            <p className="text-slate-400 font-medium animate-pulse">Đang chuẩn bị thẻ học...</p>
          </div>
        ) : dueWords.length === 0 ? (
          <div className="text-center py-24 bg-white rounded-[2rem] shadow-sm relative overflow-hidden border border-gray-100">
            <div className="relative z-10">
              <div className="w-24 h-24 mx-auto bg-emerald-50 rounded-full flex items-center justify-center mb-6 border-8 border-white shadow-sm">
                <CheckCircle2 className="w-12 h-12 text-[#005537]" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Mục tiêu hôm nay đã hoàn thành!</h3>
              <p className="text-gray-500 max-w-md mx-auto leading-relaxed">
                Thật tuyệt vời! Bạn đã ôn tập hết tất cả từ vựng cần thiết cho hôm nay.
              </p>
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <FlashCard
              words={dueWords as FlashcardWord[]}
              onReview={(payload) => updateMutation.mutate(payload)}
            />
          </div>
        )}
      </div>
    );
  }

  // Render Dashboard
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header Area */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800 mb-1">Your Decks</h1>
            <p className="text-slate-500 text-sm font-medium">
              Review your collections or create new ones to continue your journey.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 font-semibold text-sm rounded-lg hover:bg-slate-200 transition">
              <ListFilter className="w-4 h-4" />
              Sort By Recent
            </button>
            <button className="flex items-center gap-2 px-5 py-2.5 bg-[#005537] text-white font-bold text-sm rounded-xl hover:bg-[#00442a] transition shadow-md hover:shadow-lg">
              <Plus className="w-5 h-5" />
              New Deck
            </button>
          </div>
        </div>

        {/* Decks Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mockDecks.map((deck) => (
            <div
              key={deck.id}
              className="bg-white rounded-[1.5rem] p-6 shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100 group flex flex-col h-full hover:-translate-y-1"
            >
              {/* Card Header */}
              <div className="flex justify-between items-start mb-5">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${deck.iconBg}`}>
                  <deck.icon className={`w-6 h-6 ${deck.iconColor}`} />
                </div>
                <Badge variant="secondary" className={`${deck.badgeBg} font-bold text-xs px-3 py-1 border-none tracking-wide`}>
                  {deck.category}
                </Badge>
              </div>

              {/* Card Title & Desc */}
              <div className="mb-6 flex-1">
                <h3 className="text-xl font-bold text-slate-800 mb-1.5 group-hover:text-[#005537] transition-colors">{deck.title}</h3>
                <p className="text-slate-500 text-sm font-medium leading-relaxed">{deck.description}</p>
              </div>

              {/* Mastery Bar */}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Mastery</span>
                  <span className="text-xs font-bold text-[#005537]">{deck.mastery}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${deck.masteryColor}`}
                    style={{ width: `${deck.mastery}%` }}
                  />
                </div>
              </div>

              {/* Stats Row */}
              <div className="flex justify-between items-center mb-6 px-1">
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">New</span>
                  <span className="text-lg font-bold text-[#005537] leading-none">{deck.stats.new}</span>
                </div>
                <div className="h-6 w-px bg-slate-100" />
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Due</span>
                  <span className="text-lg font-bold text-red-500 leading-none">{deck.stats.due}</span>
                </div>
                <div className="h-6 w-px bg-slate-100" />
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total</span>
                  <span className="text-lg font-bold text-slate-700 leading-none">{deck.stats.total.toLocaleString()}</span>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={() => setActiveDeck(deck.id)}
                className={`w-full py-3.5 rounded-xl font-bold text-sm flex justify-center items-center gap-2 transition-all duration-300 ${deck.primaryAction === 'Study Now'
                  ? 'bg-[#005537] text-white hover:bg-[#00442a] hover:shadow-lg'
                  : 'bg-white border-2 border-[#005537] text-[#005537] hover:bg-slate-50'
                  }`}
              >
                {deck.primaryAction} {deck.primaryAction === 'Study Now' ? <Play className="w-4 h-4 fill-current" /> : <RotateCcw className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}