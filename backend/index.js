const express = require('express');
const app = express();
const port = 3001;

app.use(express.json());

app.get('/api/message', (req, res) => {
  res.json({ message: 'Hello from backend!' });
});

app.listen(port, () => {
  console.log(`Backend listening at http://localhost:${port}`);
});