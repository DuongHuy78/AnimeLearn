import express from 'express';
import { getQuizByVideoId } from '../controllers/quizController.js';
import { authMiddleware } from '../middleware/auth.js';
import Quiz from '../models/Quiz.js';
import Video from '../models/Video.js';
import { generateQuizFromScript } from '../services/quizAIService.js';

const router = express.Router();

router.get('/:videoId', authMiddleware, getQuizByVideoId);

router.post('/:videoId/generate', authMiddleware, async (req, res) => {
    try {
        const { videoId } = req.params;
        const { script } = req.body;

        const video = await Video.findById(videoId).select('duration script').lean();
        if (!video) {
            return res.status(404).json({ error: 'Khong tim thay video' });
        }

        const sourceScript = Array.isArray(script) && script.length > 0 ? script : video.script;
        if (!Array.isArray(sourceScript) || sourceScript.length === 0) {
            return res.status(400).json({ error: 'Video chua co script de tao quiz' });
        }

        const existingQuiz = await Quiz.findOne({ videoId });
        if (existingQuiz) {
            return res.json({ message: 'Quiz da ton tai', quiz: existingQuiz });
        }

        const aiResult = await generateQuizFromScript(sourceScript, {
            durationSeconds: video.duration || 0,
        });

        const newQuiz = new Quiz({
            videoId,
            questions: aiResult.questions,
        });
        await newQuiz.save();

        if (aiResult.jlptLevel && aiResult.jlptLevel !== 'Unknown') {
            await Video.findByIdAndUpdate(videoId, {
                jlpt_level: aiResult.jlptLevel,
            });
        }

        res.json({ message: 'Tao Quiz thanh cong', quiz: newQuiz, jlptLevel: aiResult.jlptLevel });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Loi khi AI tao quiz' });
    }
});

export default router;
