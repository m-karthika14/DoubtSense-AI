const mongoose = require('mongoose');

const ConfusionEventSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    topic: { type: String, required: true, trim: true },
    behavior_vector: {
      type: [Number],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length === 5 && arr.every((n) => typeof n === 'number' && Number.isFinite(n)),
        message: 'behavior_vector must be an array of 5 numbers',
      },
    },
    prediction: { type: mongoose.Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now, index: true },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: 'confusion_events',
  }
);

ConfusionEventSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('ConfusionEvent', ConfusionEventSchema);
