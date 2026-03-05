const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  userId: {
    type: String,
    unique: true,
    required: true,
    index: true,
  },
  // Make name unique (sparse to allow users without names, e.g. guests)
  name: { type: String, unique: true, sparse: true, trim: true },
  email: { type: String, lowercase: true, index: true },
  password: { type: String },
  isGuest: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
