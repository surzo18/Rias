const c = require('crypto');
const s = process.env.TOOL_INTERNAL_TOKEN;
if (!s) { process.exit(1); }
const h = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
const p = Buffer.from(JSON.stringify({iss:'esdeath-gateway',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
const g = c.createHmac('sha256', s).update(h + '.' + p).digest('base64url');
console.log(h + '.' + p + '.' + g);
