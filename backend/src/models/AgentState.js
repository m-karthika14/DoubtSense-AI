const mongoose = require('mongoose');

const AgentStateSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  agentActive: { type: Boolean, required: true, default: true },
  lastUpdated: { type: Date, default: Date.now, index: true },
});

module.exports = mongoose.model('AgentState', AgentStateSchema);
