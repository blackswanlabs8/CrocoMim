const path = require('path');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');

const FeedbackStore = require('./lib/feedbackStore');

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FEEDBACK_FILE = process.env.FEEDBACK_FILE || path.join(DATA_DIR, 'feedback.log');

const app = express();
const feedbackStore = new FeedbackStore(FEEDBACK_FILE);

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',').map(s => s.trim()).filter(Boolean) || true
}));
app.use(express.json({ limit: '256kb' }));

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err){
    return res.status(400).json({ ok: false, error: 'Invalid JSON payload' });
  }
  return next(err);
});

app.post('/api/feedback', async (req, res, next) => {
  try {
    const { body } = req;
    const errors = validateFeedback(body);
    if (errors.length){
      return res.status(400).json({ ok: false, errors });
    }

    const entry = {
      receivedAt: new Date().toISOString(),
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || null,
      feedback: sanitizeFeedback(body)
    };

    await feedbackStore.save(entry);

    return res.json({ ok: true });
  } catch (err){
    return next(err);
  }
});

app.get('/healthz', (req, res) => {
  res.json({ ok: true });
});

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled error', err);
  res.status(500).json({ ok: false, error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`CrocoMim server listening on port ${PORT}`);
});

function validateFeedback(payload){
  const errors = [];
  if (!payload || typeof payload !== 'object'){
    errors.push({ field: 'body', message: 'Expected JSON object' });
    return errors;
  }
  const { category, message, consent, context, client } = payload;
  if (!['typo', 'difficulty', 'other'].includes(category)){
    errors.push({ field: 'category', message: 'Unknown category' });
  }
  if (typeof message !== 'string' || message.trim().length < 10){
    errors.push({ field: 'message', message: 'Message must be at least 10 characters' });
  }
  if (consent !== true){
    errors.push({ field: 'consent', message: 'Consent is required' });
  }
  if (!context || typeof context !== 'object'){
    errors.push({ field: 'context', message: 'Context is required' });
  }
  if (!client || typeof client !== 'object'){
    errors.push({ field: 'client', message: 'Client info is required' });
  }
  return errors;
}

function sanitizeFeedback(payload){
  return {
    category: payload.category,
    message: typeof payload.message === 'string' ? payload.message.trim() : '',
    email: typeof payload.email === 'string' && payload.email.trim() ? payload.email.trim() : null,
    consent: true,
    context: sanitizeObject(payload.context),
    client: sanitizeObject(payload.client)
  };
}

function sanitizeObject(value){
  if (!value || typeof value !== 'object') return {};
  const result = {};
  for (const [key, val] of Object.entries(value)){
    if (val === null || val === undefined) continue;
    if (typeof val === 'string'){
      result[key] = val.trim();
    } else {
      result[key] = val;
    }
  }
  return result;
}

function getClientIp(req){
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length){
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || null;
}

