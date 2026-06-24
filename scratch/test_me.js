const http = require('http');

function testMeGet() {
  const options = {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/auth/me',
    method: 'GET',
    headers: {
      'Cookie': 'sb-access-token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZm9lbXB3b2V1cmhobHhxeGd5Iiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJzdWIiOiI3MDRmNzFiMi0xNGQ1LTRlOWItYjdmOC0xN2U3MmE1ZTRmZWQiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiaWF0IjoxNzc4NTUwOTM2LCJleHAiOjIwOTQxMjY5MzZ9.MockSignaturePlaceholder'
    }
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      console.log('--- ME API ---');
      console.log('Status:', res.statusCode);
      console.log('Body:', data);
    });
  });

  req.on('error', (e) => {
    console.error('Request error:', e);
  });

  req.end();
}

testMeGet();
