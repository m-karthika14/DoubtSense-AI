function detectTopic(rawText) {
  const text = String(rawText || '').toLowerCase();

  if (text.includes('binary tree')) {
    return { topic: 'Binary Trees', matchedKeyword: 'binary tree' };
  }

  if (text.includes('graph')) {
    return { topic: 'Graphs', matchedKeyword: 'graph' };
  }

  if (text.includes('array')) {
    return { topic: 'Arrays', matchedKeyword: 'array' };
  }

  return { topic: 'General', matchedKeyword: null };
}

module.exports = { detectTopic };
