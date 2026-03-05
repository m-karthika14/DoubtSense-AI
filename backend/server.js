// Lightweight entry file so you can run `node server.js` from the backend root
// It loads env, prints a short startup message, and delegates to the existing src/index.js
require('dotenv').config();
console.log('[server.js] Booting DoubtSense backend (server.js entry)');

const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/db');
const authRoutes = require('./src/routes/auth');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
	res.json({ message: 'DoubtSense Backend OK' });
});

app.use('/api/auth', authRoutes);

const PORT = process.env.PORT || 4000;

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
		await connectDB(process.env.MONGODB_URI);
		const server = app.listen(PORT, () => console.log(`[server] Listening on http://localhost:${PORT}`));

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
