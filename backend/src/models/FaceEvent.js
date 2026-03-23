const mongoose = require('mongoose');

const FaceDataSchema = new mongoose.Schema(
  {
    present: { type: Boolean, required: true },
    attention_score: { type: Number, required: true },
    emotion: { type: String, required: true },
    emotion_score: { type: Number, required: true },
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

FaceEventSchema.index({ student_id: 1, timestamp: -1 });

module.exports = mongoose.model('FaceEvent', FaceEventSchema);
