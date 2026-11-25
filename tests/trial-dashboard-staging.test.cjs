'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const erp=require('../school-erp-entry.js');
const lead=require('../leadership-app.js');
test('trial dashboard status uses server time and same countdown on both owner portals',()=>{
 for(const portal of [erp,lead]){
  const status={status:'trial',server_time:'2026-11-25T00:00:00Z',ends_at:'2026-12-25T00:00:00Z'};
  assert.match(portal.trialStatusText(status),/30 days remaining/);
  for(const day of [18,22,24]){
    const s={...status,server_time:'2026-12-'+day+'T00:00:00Z'};
    assert.match(portal.trialStatusText(s),/Renewal reminder/);
  }
  assert.match(portal.trialStatusText({...status,server_time:status.ends_at}),/read-only/);
  assert.match(portal.trialStatusText({status:'unassigned'}),/not assigned/);
  assert.match(portal.trialStatusText({status:'trial'}),/unavailable/);
 }
});
