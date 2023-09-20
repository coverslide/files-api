const http = require('http');
const api = require('./api');

const fileroot = process.argv[2] || process.env.ROOT || '.';

const server = http.createServer();

server.on('request', api(fileroot));

server.listen(process.env.PORT || 8087);
