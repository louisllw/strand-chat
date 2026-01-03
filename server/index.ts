import express from 'express';
import http from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import './env.js';
import { Server as SocketIOServer } from 'socket.io';
import { randomUUID } from 'crypto';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import createConversationsRouter from './routes/conversations.js';
import createMessagesRouter from './routes/messages.js';
import { getSecureCookieSetting } from './auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { ensureCsrfCookie, requireCsrf } from './middleware/csrf.js';
import { createSocketManager } from './socket/manager.js';
import { registerSocketHandlers } from './socket/handlers.js';
import { query } from './db.js';
import { logger } from './utils/logger.js';
import { startMessageReadCleanup } from './services/messageReadCleanup.js';

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
logger.info('[auth] secure cookies', { secureCookies });

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);
app.use((req, res, next) => {
  const incoming = req.headers['x-request-id'];
  const requestId = typeof incoming === 'string' && incoming ? incoming : randomUUID();
  req.id = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});
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
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(ensureCsrfCookie);
app.use(requireCsrf);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/ready', async (_req, res) => {
  try {
    await query('select 1');
    res.json({ ok: true });
  } catch {
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
    logger.info('Server listening', { url: `http://localhost:${port}` });
  }
});

startMessageReadCleanup();
