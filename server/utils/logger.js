const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const resolveLevel = () => {
  const envLevel = (process.env.LOG_LEVEL || '').toLowerCase();
  if (envLevel && Object.prototype.hasOwnProperty.call(levels, envLevel)) {
    return envLevel;
  }
  return process.env.NODE_ENV === 'production' ? 'warn' : 'info';
};

const currentLevel = resolveLevel();
const currentValue = levels[currentLevel] ?? levels.info;

const shouldLog = (level) => levels[level] <= currentValue;

export const logger = {
  error: (...args) => shouldLog('error') && console.error(...args),
  warn: (...args) => shouldLog('warn') && console.warn(...args),
  info: (...args) => shouldLog('info') && console.log(...args),
  debug: (...args) => shouldLog('debug') && console.log(...args),
};
