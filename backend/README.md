# DoubtSense Backend

This is a lightweight Express + MongoDB backend used by the DoubtSense frontend. It provides simple auth endpoints (register, login, me) and demonstrates a MongoDB connection using the official Node.js driver.

Prerequisites
- Node.js 18+ (or latest LTS)
- A MongoDB connection string (Atlas or self-hosted)

Setup
1. Copy `.env.example` to `.env` and set the values:

```
MONGODB_URI=your_mongodb_connection_string_here
JWT_SECRET=some_long_random_secret
PORT=4000
```

2. Install dependencies and start in dev mode:

```powershell
cd backend
npm install
npm run dev
```

API
- POST /api/auth/register { email, password, name? } -> { token, user }
- POST /api/auth/login { email, password } -> { token, user }
- GET /api/auth/me -> { user } (requires Authorization: Bearer <token>)

Notes
- This backend is intentionally minimal. It uses `bcryptjs` for password hashing and `jsonwebtoken` for simple JWTs. For production, use HTTPS, proper secret management, input validation, rate limiting, and stronger security practices.
