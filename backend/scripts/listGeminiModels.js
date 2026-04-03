const fs = require('fs');

function readEnvVarFromFile(filePath, key) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const re = new RegExp(`^\\s*${key}\\s*=\\s*(.*)\\s*$`, 'm');
  const match = raw.match(re);
  if (!match) return '';
  return String(match[1] || '').trim().replace(/^['"]|['"]$/g, '');
}

async function main() {
  const envPath = 'c:/main/doubtsenseAI/backend/.env';
  const apiKey = readEnvVarFromFile(envPath, 'GEMINI_API_KEY');

  if (!apiKey) {
    console.error(`GEMINI_API_KEY missing/empty in ${envPath}`);
    process.exit(1);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error(`ListModels failed: ${res.status} ${res.statusText}`);
    console.error(JSON.stringify(json, null, 2));
    process.exit(1);
  }

  const models = Array.isArray(json.models) ? json.models : [];
  const usable = models
    .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
    .map((m) => m.name);

  console.log('USABLE_MODELS=');
  usable.forEach((name) => console.log(name));
  console.log(`TOTAL_USABLE=${usable.length}`);
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
