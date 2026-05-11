/**
 * Acquirer Mock Server
 * Simulates a real payment acquirer with configurable responses.
 *
 * Card behavior:
 *   4111xxxxxxxxxxxx → APPROVED  (success scenario)
 *   4000xxxxxxxxxxxx → DECLINED  (decline scenario)
 *   5200xxxxxxxxxxxx → random 5xx error (error scenario)
 *   All others       → 80% APPROVED / 20% DECLINED
 */

const http = require('http');

const PORT = process.env.PORT || 3001;

function authorize(body) {
  const cardNumber = body?.card?.number || '';
  const prefix4 = cardNumber.substring(0, 4);
  const prefix4_alt = cardNumber.substring(0, 4);

  // Simulate temporary server errors for certain cards
  if (prefix4_alt === '5200') {
    const err = new Error('Acquirer internal error');
    err.statusCode = 503;
    throw err;
  }

  let approved, responseCode, responseMessage;

  if (prefix4 === '4111') {
    approved = true;
    responseCode = '00';
    responseMessage = 'Approved';
  } else if (prefix4 === '4000') {
    approved = false;
    responseCode = '05';
    responseMessage = 'Do not honor';
  } else {
    approved = Math.random() > 0.2;
    responseCode = approved ? '00' : '51';
    responseMessage = approved ? 'Approved' : 'Insufficient funds';
  }

  return {
    approved,
    authorization_code: approved
      ? Math.random().toString(36).substring(2, 8).toUpperCase()
      : undefined,
    response_code: responseCode,
    response_message: responseMessage,
    acquirer_transaction_id: `ACQ-MOCK-${Date.now()}`,
  };
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/authorize') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        console.log(`[ACQUIRER] Received authorization for tx: ${parsed.transaction_id}`);

        // Simulate processing latency
        const delay = Math.floor(Math.random() * 300) + 100;
        setTimeout(() => {
          try {
            const response = authorize(parsed);
            console.log(`[ACQUIRER] Response: ${response.response_message} (${response.response_code})`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
          } catch (err) {
            console.error(`[ACQUIRER] Error: ${err.message}`);
            res.writeHead(err.statusCode || 500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        }, delay);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
  } else if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'acquirer-mock' }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`[ACQUIRER] Mock server listening on port ${PORT}`);
});
