const http = require('http');

const FISH_HOST = process.env.FISH_SPEECH_HOST || 'fish-speech';
const FISH_PORT = parseInt(process.env.FISH_SPEECH_PORT || '8080', 10);
const PORT = parseInt(process.env.PORT || '3100', 10);

const FORMAT_MAP = { opus: 'wav', aac: 'wav', flac: 'wav' };

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }

  if (req.method !== 'POST' || req.url !== '/v1/audio/speech') {
    res.writeHead(404);
    return res.end('not found');
  }

  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    let openai;
    try {
      openai = JSON.parse(body);
    } catch {
      res.writeHead(400);
      return res.end('invalid json');
    }

    const fmt = FORMAT_MAP[openai.response_format] || openai.response_format || 'mp3';
    const fishBody = JSON.stringify({
      text: openai.input || '',
      reference_id: openai.voice || null,
      format: fmt,
      normalize: true,
    });

    const fishReq = http.request(
      {
        hostname: FISH_HOST,
        port: FISH_PORT,
        path: '/v1/tts',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(fishBody),
        },
      },
      (fishRes) => {
        res.writeHead(fishRes.statusCode, {
          'Content-Type': fishRes.headers['content-type'] || 'audio/mpeg',
        });
        fishRes.pipe(res);
      }
    );

    fishReq.on('error', () => {
      res.writeHead(502);
      res.end('fish speech unavailable');
    });

    fishReq.end(fishBody);
  });
});

server.listen(PORT, '0.0.0.0');
