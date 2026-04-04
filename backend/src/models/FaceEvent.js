const mongoose = require('mongoose');

const FaceDataSchema = new mongoose.Schema(
  {
    present: { type: Boolean, required: true },
    // Continuous 0..1
    attention_score: { type: Number, required: true, min: 0, max: 1 },
    emotion: { type: String, required: true },
    emotion_score: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false }
);

const FaceEventSchema = new mongoose.Schema(
  {
    student_id: { type: String, required: true, index: true },
    timestamp: { type: Date, required: true, index: true },
    face_data: { type: FaceDataSchema, required: true },
  },
  {
    collection: 'face_events',
  }
);

// TTL index: automatically expire events after a configurable interval (default 6 hours)
const EVENT_TTL_SECONDS = Number(process.env.EVENT_TTL_SECONDS || 21600);
FaceEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: EVENT_TTL_SECONDS });
FaceEventSchema.index({ student_id: 1, timestamp: -1 });

module.exports = mongoose.model('FaceEvent', FaceEventSchema);
