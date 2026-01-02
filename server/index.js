import express from 'express';
import http from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import './env.js';
import { Server as SocketIOServer } from 'socket.io';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import createConversationsRouter from './routes/conversations.js';
import createMessagesRouter from './routes/messages.js';
import { getSecureCookieSetting } from './auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createSocketManager } from './socket/manager.js';
import { registerSocketHandlers } from './socket/handlers.js';
import { query } from './db.js';

const app = express();
const trustProxy = process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1';
if (trustProxy) {
  app.set('trust proxy', 1);
}
const server = http.createServer(app);
const clientOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const allowAllOrigins = process.env.NODE_ENV !== 'production' || process.env.CORS_ALLOW_ALL === 'true';
const corsOrigin = allowAllOrigins ? true : clientOrigins;
const io = new SocketIOServer(server, {
  cors: {
    origin: corsOrigin,
    credentials: true,
  },
});
const secureCookies = getSecureCookieSetting();
console.log(`[auth] secure cookies ${secureCookies ? 'enabled' : 'disabled'}`);

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);
app.use(helmet());
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  })
);
app.use(express.json({ limit: '30mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/ready', async (_req, res) => {
  try {
    await query('select 1');
    res.json({ ok: true });
  } catch (error) {
    res.status(503).json({ ok: false });
  }
});

const socketManager = createSocketManager(io);
registerSocketHandlers(io, socketManager);

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/conversations', createConversationsRouter(socketManager));
app.use('/api/messages', createMessagesRouter(socketManager));

app.use(errorHandler);

const port = Number(process.env.PORT || 3001);
server.listen(port, () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Server listening on http://localhost:${port}`);
  }
});
