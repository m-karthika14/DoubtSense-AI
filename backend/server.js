// Lightweight entry file so you can run `node server.js` from the backend root
// It loads env, prints a short startup message, and delegates to the existing src/index.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
console.log('[server.js] Booting DoubtSense backend (server.js entry)');

const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/db');
const authRoutes = require('./src/routes/auth');
const uploadRoutes = require('./src/routes/upload');
const contextRoutes = require('./src/routes/context');
const agentRoutes = require('./src/routes/agent');
const contentRoutes = require('./src/routes/content');
const faceDataRoutes = require('./src/routes/faceData');
const confusionRoutes = require('./src/routes/confusion');
const behaviorVectorRoutes = require('./src/routes/behaviorVector');
const explainRoutes = require('./src/routes/explain');
const feedbackRoutes = require('./src/routes/feedback');

const app = express();
app.use(cors());
app.use(express.json());

// Serve uploaded files for exact in-app previews
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
	res.json({ message: 'DoubtSense Backend OK' });
});

app.use('/api/auth', authRoutes);
app.use('/api', uploadRoutes);
app.use('/api', contextRoutes);
app.use('/api', agentRoutes);
app.use('/api', contentRoutes);
app.use('/api', faceDataRoutes);
app.use('/api', confusionRoutes);
app.use('/api', behaviorVectorRoutes);
app.use('/api', explainRoutes);
app.use('/api', feedbackRoutes);

const DEFAULT_PORT = 4000;
const explicitPort = typeof process.env.PORT === 'string' && process.env.PORT.trim().length > 0;
const desiredPort = Number.parseInt(process.env.PORT, 10);
const START_PORT = Number.isFinite(desiredPort) ? desiredPort : DEFAULT_PORT;

// process-level logging for easier debugging
process.on('uncaughtException', (err) => {
	console.error('[process] Uncaught Exception:', err && err.message ? err.message : err);
	process.exit(1);
});

process.on('unhandledRejection', (reason) => {
	console.error('[process] Unhandled Rejection:', reason);
});

(async function start() {
	try {
		console.log('[server] Starting up...');
		if (typeof process.env.MONGODB_URI === 'string' && process.env.MONGODB_URI.trim().length > 0) {
			await connectDB(process.env.MONGODB_URI);
		} else {
			console.warn('[db] MONGODB_URI is not set. Starting backend WITHOUT MongoDB.');
			console.warn('[db] Confusion events will not be persisted until MongoDB is configured.');
		}

		let server;
		let port = START_PORT;
		// If PORT is not explicitly set, we'll automatically try the next port on conflicts.
		// If PORT is set, we fail fast with a clear message.
		while (!server) {
			try {
				server = await new Promise((resolve, reject) => {
					const s = app.listen(port, () => resolve(s));
					s.on('error', reject);
				});
				console.log(`[server] Listening on http://localhost:${port}`);
			} catch (err) {
				if (err && err.code === 'EADDRINUSE') {
					if (explicitPort) {
						console.error(`[server] Port ${port} is already in use.`);
						console.error(`[server] Pick another port, e.g. set PORT=${port + 1} and re-run.`);
						process.exit(1);
					}
					console.warn(`[server] Port ${port} is already in use; retrying on ${port + 1}...`);
					port += 1;
					continue;
				}
				throw err;
			}
		}

		// graceful shutdown
		const shutdown = () => {
			console.log('[server] Shutting down...');
			server.close(() => {
				console.log('[server] HTTP server closed');
				process.exit(0);
			});
		};

		process.on('SIGINT', shutdown);
		process.on('SIGTERM', shutdown);
	} catch (err) {
		console.error('[server] Failed to start', err && err.message ? err.message : err);
		process.exit(1);
	}
})();
