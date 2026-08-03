import Quiz from '../models/Quiz.js';
import Video from '../models/Video.js';
import { generateQuizFromScript } from '../services/quizAIService.js';

export const getQuizByVideoId = async (req, res) => {
    try {
        const { videoId } = req.params;

        const quiz = await Quiz.findOne({ videoId });
        if (!quiz) {
            return res.status(404).json({ message: 'Chua co quiz cho video nay' });
        }

        res.status(200).json(quiz);
    } catch (error) {
        console.error('Loi khi lay quiz:', error);
        res.status(500).json({ error: 'Loi may chu khi lay du lieu bai tap' });
    }
};

export const generateQuizForVideo = async (req, res) => {
    try {
        const { videoId } = req.params;
        const { script } = req.body;

        const video = await Video.findById(videoId).select('duration script').lean();
        if (!video) {
            return res.status(404).json({ error: 'Khong tim thay video' });
        }

        const sourceScript = Array.isArray(script) && script.length > 0 ? script : video.script;
        if (!Array.isArray(sourceScript) || sourceScript.length === 0) {
            return res.status(400).json({ error: 'Script khong hop le hoac dang trong' });
        }

        const existingQuiz = await Quiz.findOne({ videoId });
        if (existingQuiz) {
            return res.status(400).json({ error: 'Video nay da co bai tap roi' });
        }

        const aiResult = await generateQuizFromScript(sourceScript, {
            durationSeconds: video.duration || 0,
        });

        if (!aiResult?.questions?.length) {
            return res.status(500).json({ error: 'AI khong tao duoc cau hoi nao tu script nay' });
        }

        const newQuiz = new Quiz({
            videoId,
            questions: aiResult.questions,
        });

        await newQuiz.save();

        if (aiResult.jlptLevel && aiResult.jlptLevel !== 'Unknown') {
            await Video.findByIdAndUpdate(videoId, { jlpt_level: aiResult.jlptLevel });
        }

        res.status(201).json({ quiz: newQuiz, jlptLevel: aiResult.jlptLevel });
    } catch (error) {
        console.error('Loi tao Quiz:', error);
        res.status(500).json({ error: 'Loi he thong khi tao bai tap bang AI' });
    }
};
