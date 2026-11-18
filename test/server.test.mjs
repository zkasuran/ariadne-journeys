// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { server } from '../dist/src/server.js';
import { request } from 'node:http';
const port = 48192;
test('loopback API rejects unexpected hosts, origins, content types and missing approval', async () => {
  const app = server(port);
  await new Promise((resolve,reject) => { app.once('error',reject); app.listen(port,'127.0.0.1',resolve); });
  try {
    const origin = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(origin+'/api/status')).status,200);
    const wrongHost = await new Promise((resolve,reject) => { const req=request(origin+'/api/status',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode)});req.on('error',reject);req.end(); });
    assert.equal(wrongHost,403);
    assert.equal((await fetch(origin+'/api/status',{headers:{Origin:'https://evil.example'}})).status,403);
    assert.equal((await fetch(origin+'/api/repair',{method:'POST',body:'{}'})).status,415);
    assert.equal((await fetch(origin+'/api/repair',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,400);
  } finally { await new Promise(resolve=>app.close(resolve)); }
});
