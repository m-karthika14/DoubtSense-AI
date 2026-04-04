const mongoose = require('mongoose');

const WebContextEventSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    topic: { type: String, required: true },
    title: { type: String, default: '' },
    url: { type: String, default: '' },
    headings: { type: [String], default: [] },
    paragraph: { type: String, default: '' },
    importantContent: { type: Boolean, default: false },
    source: { type: String, enum: ['extension', 'website'], default: 'website' },
  },
  { timestamps: true }
);

WebContextEventSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('WebContextEvent', WebContextEventSchema);
