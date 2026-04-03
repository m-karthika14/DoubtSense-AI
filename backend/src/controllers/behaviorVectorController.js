function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function parseUnixSecondsToDate(ts) {
  const n = typeof ts === 'number' ? ts : Number(ts);
  if (!Number.isFinite(n)) return null;
  return new Date(n * 1000);
}

async function logBehaviorVector(req, res) {
  try {
    const userId = String(req.body.userId || '').trim();
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const topic = isNonEmptyString(req.body.topic) ? String(req.body.topic).trim() : 'General';

    const behavior_vector = req.body.behavior_vector;
    if (!Array.isArray(behavior_vector) || behavior_vector.length !== 5) {
      return res.status(400).json({ message: 'behavior_vector must be an array of 5 numbers' });
    }

    const nums = behavior_vector.map((x) => (typeof x === 'number' ? x : Number(x)));
    if (nums.some((n) => !Number.isFinite(n))) {
      return res.status(400).json({ message: 'behavior_vector must contain only finite numbers' });
    }

    let timestamp = null;
    if (req.body.timestamp) {
      timestamp = parseUnixSecondsToDate(req.body.timestamp);
      if (!timestamp || Number.isNaN(timestamp.getTime())) {
        return res.status(400).json({ message: 'timestamp must be a unix time (seconds)' });
      }
    }

    const line = {
      userId,
      topic,
      behavior_vector: nums,
      timestamp: (timestamp || new Date()).toISOString(),
    };

    console.log('[behavior_vector]', JSON.stringify(line));

    return res.json({ ok: true });
  } catch (err) {
    console.error('[behavior_vector] log error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { logBehaviorVector };
