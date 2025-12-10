const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Hello');
});
server.listen(5173, () => console.log('Listening on 5173'));
