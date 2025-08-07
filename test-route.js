const express = require('express');
const app = express();

// Test routes to verify path-to-regexp works
app.get('/api/test', (req, res) => {
  res.json({ message: 'Test route works' });
});

app.get('/api/test/:id', (req, res) => {
  res.json({ message: 'Test route with param works', id: req.params.id });
});

app.get('/api/rezerwacja-error/:token', (req, res) => {
  res.json({ message: 'Error route works', token: req.params.token });
});

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
  console.log('Testing routes:');
  console.log('- GET /api/test');
  console.log('- GET /api/test/:id');
  console.log('- GET /api/rezerwacja-error/:token');
});
