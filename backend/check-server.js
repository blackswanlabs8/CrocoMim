#!/usr/bin/env node

const { checkHealth, sendTestFeedback } = require('./lib/serverChecks');
const {
  getPublicApiBaseUrl,
  getBackendBaseUrl
} = require('./lib/runtimeConfig');

function resolveDefaultBaseUrl(){
  return getPublicApiBaseUrl() || getBackendBaseUrl() || 'http://localhost:3000';
}

async function main(){
  const baseUrl = process.argv[2] || process.env.CROCOMIM_BASE_URL || resolveDefaultBaseUrl();
  try {
    const healthOk = await checkHealth(baseUrl);
    console.log(`Health check (${baseUrl}/healthz): ${healthOk ? 'OK' : 'FAILED'}`);

    const feedbackResponse = await sendTestFeedback(baseUrl);
    console.log('Feedback test response:', feedbackResponse);

    console.log('Server is accepting feedback submissions.');
  } catch (err){
    console.error('Server check failed:', err.message);
    if (err.body){
      console.error('Response body:', err.body);
    }
    process.exitCode = 1;
  }
}

main();
