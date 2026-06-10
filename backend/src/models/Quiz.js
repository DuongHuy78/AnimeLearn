import mongoose from 'mongoose';

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

const questionSchema = new mongoose.Schema({
    timestamp: { type: String, required: true },
    startTimeSeconds: {
        type: Number,
        required: true,
        min: 0,
    },
    endTimeSeconds: {
        type: Number,
        required: true,
        min: 0,
        validate: {
            validator: function (value) {
                return value > this.startTimeSeconds;
            },
            message: 'Thoi gian ket thuc phai lon hon thoi gian bat dau!'
        }
    },
    type: {
        type: String,
        required: true,
        enum: QUESTION_TYPES,
    },
    questionText: { type: String, required: true },
    options: {
        type: [{ type: String, required: true }],
        required: true,
        validate: {
            validator: function (v) {
                return Array.isArray(v) && v.length === 4;
            },
            message: 'Moi cau hoi phai co chinh xac 4 dap an!'
        }
    },
    correctAnswerIndex: {
        type: Number,
        required: true,
        min: 0,
        max: 3,
        validate: {
            validator: Number.isInteger,
            message: 'Chi so dap an dung phai la so nguyen!'
        }
    },
    explanation: { type: String }
}, { _id: false });

const quizSchema = new mongoose.Schema({
    videoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Video',
        required: true,
        unique: true
    },
    questions: [questionSchema]
}, {
    timestamps: true,
    toJSON: { virtuals: true, transform: (doc, ret) => { delete ret._id; delete ret.__v; } },
    toObject: { virtuals: true }
});

export default mongoose.model('Quiz', quizSchema);
