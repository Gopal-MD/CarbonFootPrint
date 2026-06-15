import fetch from 'node-fetch';

const BASE = 'https://carbonfootprint-984604014815.asia-south1.run.app';

async function check() {
  const jsRes = await fetch(`${BASE}/assets/js/index-CrP0pMrV.js`);
  const js = await jsRes.text();
  
  // Search for actual Firebase config values that got baked in
  const apiKeyMatch = js.match(/apiKey:"([^"]+)"/);
  const authDomainMatch = js.match(/authDomain:"([^"]+)"/);
  
  console.log('apiKey in bundle:', apiKeyMatch ? apiKeyMatch[1] : 'NOT FOUND');
  console.log('authDomain in bundle:', authDomainMatch ? authDomainMatch[1] : 'NOT FOUND');
  
  // Check if manifest.json is returning HTML (the SPA fallback)
  const mfRes = await fetch(`${BASE}/manifest.json`);
  const mfBody = await mfRes.text();
  console.log('\nmanifest.json content-type:', mfRes.headers.get('content-type'));
  console.log('manifest.json first 100 chars:', mfBody.substring(0, 100));
}

check().catch(console.error);
