const mongoose = require('mongoose');

const ContentSectionSchema = new mongoose.Schema(
  {
    sectionId: { type: String, required: true },
    topic: { type: String, required: true },
    text: { type: String, required: true },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      required: true,
    },
  },
  { _id: false }
);

const ContentSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  sourceType: {
    type: String,
    enum: ['upload', 'website', 'external_pdf'],
    required: true,
    index: true,
  },
  title: { type: String, required: true, trim: true },
  sourceUrl: { type: String },
  fileUrl: { type: String },
  contentMap: { type: [ContentSectionSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
});

ContentSchema.index({ userId: 1, createdAt: -1 });
ContentSchema.index({ userId: 1, sourceType: 1 });

module.exports = mongoose.model('Content', ContentSchema);
