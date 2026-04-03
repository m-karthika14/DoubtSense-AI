const mongoose = require('mongoose');

const FeedbackSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  topic: { type: String, default: 'General' },
  levelSeen: { type: Number, min: 1, max: 3, required: true },
  understood: { type: Boolean, required: true },
  timestamp: { type: Date, default: Date.now, index: true },
});

module.exports = mongoose.model('Feedback', FeedbackSchema);
