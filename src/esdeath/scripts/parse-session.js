const fs = require('fs');
const dir = '/home/node/.openclaw/agents/main/sessions/';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
if (files.length === 0) { console.log('No session files'); process.exit(0); }
const data = fs.readFileSync(dir + files[files.length - 1], 'utf8');
const lines = data.split('\n').filter(Boolean);
for (let i = 0; i < lines.length; i++) {
  try {
    const obj = JSON.parse(lines[i]);
    if (obj.type !== 'message') continue;
    const msg = obj.message;
    if (!msg) continue;
    if (msg.role === 'toolResult') {
      const tc = typeof msg.content === 'string' ? msg.content :
        Array.isArray(msg.content) ? msg.content.map(function(c) { return c.text || ''; }).join('') :
        JSON.stringify(msg.content);
      console.log('RESULT[' + i + ']:', tc.slice(0, 600));
    } else if (msg.role === 'user') {
      const uc = Array.isArray(msg.content) ? msg.content.map(function(x) { return x.text || ''; }).join('') : String(msg.content);
      console.log('USER[' + i + ']:', uc.slice(0, 200));
    } else if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (let j = 0; j < msg.content.length; j++) {
        const c = msg.content[j];
        if (c.type === 'text') console.log('ASSISTANT[' + i + ']:', c.text.slice(0, 500));
        if (c.type === 'toolCall') {
          const args = typeof c.arguments === 'object' ? JSON.stringify(c.arguments) : String(c.arguments);
          console.log('CALL[' + i + ']:', c.name, '->', args.slice(0, 500));
        }
      }
    }
  } catch (e) {}
}
