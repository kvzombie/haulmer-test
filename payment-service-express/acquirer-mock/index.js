const http = require('http');
const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/authorize') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const parsed = JSON.parse(body);
      const prefix = (parsed?.card?.number || '').substring(0, 4);

      setTimeout(() => {
        let approved, code, message;
        if (prefix === '4111') { approved = true;  code = '00'; message = 'Approved'; }
        else if (prefix === '4000') { approved = false; code = '05'; message = 'Do not honor'; }
        else { approved = Math.random() > 0.2; code = approved ? '00' : '51'; message = approved ? 'Approved' : 'Insufficient funds'; }

        console.log(`[ACQUIRER] tx=${parsed.transaction_id} → ${message}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          approved,
          authorization_code: approved ? Math.random().toString(36).substring(2, 8).toUpperCase() : undefined,
          response_code: code,
          response_message: message,
          acquirer_transaction_id: `ACQ-${Date.now()}`,
        }));
      }, Math.floor(Math.random() * 200) + 100);
    });
  } else if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200); res.end(JSON.stringify({ status: 'ok' }));
  } else {
    res.writeHead(404); res.end();
  }
});

server.listen(PORT, () => console.log(`[ACQUIRER] Mock listening on port ${PORT}`));
