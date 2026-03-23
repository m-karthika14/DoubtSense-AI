function difficultyFromTextLength(text) {
  const len = String(text || '').length;
  if (len < 300) return 'easy';
  if (len <= 1000) return 'medium';
  return 'hard';
}

module.exports = { difficultyFromTextLength };
