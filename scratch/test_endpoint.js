const http = require('http');

function testProfileGet() {
  const options = {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/auth/profile',
    method: 'GET',
    headers: {
      // Simulate sb-access-token for bhkim (704f71b2-14d5-4e9b-b7f8-17e72a5e4fed)
      // Since HTTP request to getAdminClient uses access token, we will mock the logic or verify if our GET handler fails on call.
      'Cookie': 'sb-access-token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZm9lbXB3b2V1cmhobHhxeGd5Iiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJzdWIiOiI3MDRmNzFiMi0xNGQ1LTRlOWItYjdmOC0xN2U3MmE1ZTRmZWQiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiaWF0IjoxNzc4NTUwOTM2LCJleHAiOjIwOTQxMjY5MzZ9.MockSignaturePlaceholder'
    }
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      console.log('Status Code:', res.statusCode);
      console.log('Headers:', res.headers);
      console.log('Body:', data);
    });
  });

  req.on('error', (e) => {
    console.error('Request error:', e);
  });

  req.end();
}

testProfileGet();
