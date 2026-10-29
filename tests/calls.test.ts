import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {callConfiguration} from '../src/lib/calls';
test('calling never silently falls back to direct ICE in production and issues temporary relay credentials',()=>{
  const previous={NODE_ENV:process.env.NODE_ENV,TURN_URLS:process.env.TURN_URLS,TURN_SHARED_SECRET:process.env.TURN_SHARED_SECRET};
  try{
    Object.assign(process.env,{NODE_ENV:'production'});delete process.env.TURN_URLS;delete process.env.TURN_SHARED_SECRET;
    assert.equal(callConfiguration('user').available,false);
    process.env.TURN_URLS='turns:turn.example.com:5349?transport=tcp';process.env.TURN_SHARED_SECRET='test-only-local-secret';
    const c=callConfiguration('account');assert.equal(c.available,true);assert.equal(c.mode,'relay');assert.equal(c.iceTransportPolicy,'relay');
    const server=c.iceServers[0]!;assert.equal(server.credential,createHmac('sha1','test-only-local-secret').update(server.username).digest('base64'));
    const expiry=Number(server.username.split(':')[0]);assert.ok(expiry>Date.now()/1000+3500&&expiry<Date.now()/1000+3610);
    process.env.TURN_URLS='https://arbitrary.example';assert.equal(callConfiguration('account').available,false);
  }finally{for(const [k,v]of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
