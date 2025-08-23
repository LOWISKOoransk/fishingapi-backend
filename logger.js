// Prosty moduł loggera z poziomami, requestId i maskowaniem sekretów/PII
const os = require('os');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const CURRENT_LEVEL = LEVELS[LOG_LEVEL] ?? LEVELS.info;

function maskEmail(value) {
  if (typeof value !== 'string') return value;
  const at = value.indexOf('@');
  if (at <= 1) return '*@*';
  const name = value.slice(0, at);
  const domain = value.slice(at + 1);
  return `${name[0]}***@${domain.replace(/[^.]/g, '*')}`;
}

function maskToken(value) {
  if (typeof value !== 'string') return value;
  if (value.length <= 6) return '***';
  return `${value.slice(0,3)}***${value.slice(-3)}`;
}

function maskAuthorization(value) {
  if (typeof value !== 'string') return value;
  // Mask całość po prefiksie, zachowując typ
  if (/^Basic\s+/i.test(value)) return 'Basic ****';
  if (/^Bearer\s+/i.test(value)) return 'Bearer ****';
  return '****';
}

function maskString(value) {
  if (typeof value !== 'string') return value;
  // Szybkie maskowanie znanych kluczy/sektetów w tekstach
  return value
    .replace(/(apiKey|reportKey|secretId|crc|token)\s*[:=]\s*([^\s,"']+)/gi, '$1: ****')
    .replace(/Authorization\s*[:=]\s*([^\n\r]+)/gi, 'Authorization: ****')
    .replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, (_, email) => maskEmail(email));
}

function maskValueByKey(key, value) {
  const k = String(key).toLowerCase();
  if (k.includes('authorization')) return maskAuthorization(String(value));
  if (k.includes('apikey') || k.includes('reportkey') || k.includes('secretid') || k === 'crc') return '****';
  if (k.includes('token')) return maskToken(String(value));
  if (k.includes('email')) return maskEmail(String(value));
  return value;
}

function maskDeep(input, seen = new WeakSet()) {
  if (input == null) return input;
  if (typeof input === 'string') return maskString(input);
  if (typeof input !== 'object') return input;
  if (seen.has(input)) return '[Circular]';
  seen.add(input);
  if (Array.isArray(input)) return input.map(v => maskDeep(v, seen));
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = maskDeep(maskValueByKey(k, v), seen);
  }
  return out;
}

function formatLog(level, msg, fields) {
  const ts = new Date().toISOString();
  const base = {
    ts,
    level,
    host: os.hostname(),
    ...fields
  };
  if (typeof msg === 'string') base.message = maskString(msg);
  else base.message = msg;
  return JSON.stringify(maskDeep(base));
}

class Logger {
  constructor(context = {}) {
    this.context = context;
  }
  child(extra) { return new Logger({ ...this.context, ...extra }); }
  log(level, message, meta) {
    if ((LEVELS[level] ?? 99) > CURRENT_LEVEL) return;
    const line = formatLog(level, message, { ...this.context, ...meta });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  }
  error(msg, meta) { this.log('error', msg, meta); }
  warn(msg, meta) { this.log('warn', msg, meta); }
  info(msg, meta) { this.log('info', msg, meta); }
  debug(msg, meta) { this.log('debug', msg, meta); }
}

const baseLogger = new Logger();

function requestIdMiddleware(req, res, next) {
  const headerId = req.headers['x-request-id'];
  const id = headerId && typeof headerId === 'string' && headerId.trim() ? headerId.trim() : require('crypto').randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  req.logger = baseLogger.child({ requestId: id, path: req.path, method: req.method });
  req.logger.debug('HTTP Request start');
  const start = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : (res.statusCode >= 400 ? 'warn' : 'info');
    req.logger.log(level, 'HTTP Request end', { statusCode: res.statusCode, durationMs });
  });
  next();
}

module.exports = { logger: baseLogger, Logger, requestIdMiddleware };


