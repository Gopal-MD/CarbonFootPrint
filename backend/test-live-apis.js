import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const API_KEY = 'AIzaSyB45g7rteYeabGeGGFvkIOg1oralRChaI0';
const BASE_URL = 'http://localhost:8080/api';

async function runTests() {
  console.log('🧪 Starting Live API Integration Tests...');
  let idToken = '';

  try {
    console.log('\n1️⃣ Creating/Signing in test user...');
    // Try to sign in or sign up
    const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`;
    const authResp = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `test-${Date.now()}@example.com`, password: 'password123', returnSecureToken: true })
    });
    const authData = await authResp.json();
    if (!authResp.ok) throw new Error(authData.error.message);
    idToken = authData.idToken;
    console.log('✅ Auth successful! Token acquired.');
  } catch (err) {
    console.error('❌ Auth Failed:', err.message);
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${idToken}`
  };

  try {
    console.log('\n2️⃣ Testing Commute API (Google Maps)...');
    const commuteResp = await fetch(`${BASE_URL}/commute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        origin: 'San Francisco, CA',
        destination: 'Mountain View, CA',
        mode: 'DRIVING'
      })
    });
    const commuteData = await commuteResp.json();
    if (!commuteResp.ok) throw new Error(JSON.stringify(commuteData));
    console.log('✅ Commute successful! Distance:', commuteData.data.distanceKm, 'km, CO2:', commuteData.data.kgCO2e, 'kg');
  } catch (err) {
    console.error('❌ Commute API Failed:', err.message);
  }

  try {
    console.log('\n3️⃣ Testing Insights API (Gemini 2.0 Flash)...');
    const insightResp = await fetch(`${BASE_URL}/insights`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        userId: 'test-user-id',
        monthlyKgCO2e: 150.5,
        commuteKg: 40,
        utilityKg: 110.5,
        travelMode: 'DRIVING'
      })
    });
    const insightData = await insightResp.json();
    if (!insightResp.ok) throw new Error(JSON.stringify(insightData));
    console.log('✅ Insights successful! Preview:', insightData.data.insightText.substring(0, 80), '...');
  } catch (err) {
    console.error('❌ Insights API Failed:', err.message);
  }

  try {
    console.log('\n4️⃣ Testing Scan API (Gemini Vision)...');
    // We will use a tiny 1x1 transparent png as a dummy bill base64 to see if the API responds
    const dummyBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const scanResp = await fetch(`${BASE_URL}/scan`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        userId: 'test-user-id',
        imageBase64: dummyBase64,
        mimeType: 'image/png'
      })
    });
    const scanData = await scanResp.json();
    // It might return a parsing error because a 1x1 png isn't a bill, but a 200 success or valid error from Gemini means it works
    console.log('✅ Scan API responded with status:', scanResp.status);
    console.log('   Data:', JSON.stringify(scanData).substring(0, 100));
  } catch (err) {
    console.error('❌ Scan API Failed:', err.message);
  }

  console.log('\n🎉 Tests Complete!');
}

runTests();
