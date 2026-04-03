const mongoose = require('mongoose');

const ContextMetadataSchema = new mongoose.Schema(
  {
    title: { type: String },
    url: { type: String },
  },
  { _id: false }
);

const ContextSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  activeTopic: { type: String, default: 'General' },
  // Stored for LLM explanations (required by popup flow)
  headings: { type: [String], default: [] },
  title: { type: String },
  paragraph: { type: String },
  sourceType: {
    type: String,
    enum: ['internal', 'website', 'upload', 'external_pdf'],
    required: true,
  },
  contentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Content' },
  sectionId: { type: String },
  metadata: { type: ContextMetadataSchema, default: {} },
  lastUpdated: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

module.exports = mongoose.model('Context', ContextSchema);
