const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
} as const;

type LogLevel = keyof typeof levels;

const resolveLevel = (): LogLevel => {
  const envLevel = (process.env.LOG_LEVEL || '').toLowerCase();
  if (envLevel && Object.prototype.hasOwnProperty.call(levels, envLevel)) {
    return envLevel as LogLevel;
  }
  return process.env.NODE_ENV === 'production' ? 'warn' : 'info';
};

const currentLevel = resolveLevel();
const currentValue = levels[currentLevel] ?? levels.info;

const shouldLog = (level: LogLevel) => levels[level] <= currentValue;

const shouldUseJson = () => process.env.LOG_FORMAT === 'json' || process.env.NODE_ENV === 'production';

const serializeError = (value: unknown) => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  return value;
};

const buildPayload = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
  const base = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  if (!meta) return base;
  const normalized = Object.fromEntries(
    Object.entries(meta).map(([key, value]) => [key, serializeError(value)])
  );
  return { ...base, ...normalized };
};

const log = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
  if (!shouldLog(level)) return;
  if (shouldUseJson()) {
    const payload = buildPayload(level, message, meta);
    const line = JSON.stringify(payload);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
    return;
  }
  if (meta) {
    console.log(message, meta);
    return;
  }
  console.log(message);
};

export const logger = {
  error: (message: string, meta?: Record<string, unknown>) => log('error', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log('warn', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => log('info', message, meta),
  debug: (message: string, meta?: Record<string, unknown>) => log('debug', message, meta),
};
