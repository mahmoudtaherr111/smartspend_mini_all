const API_KEY = 'YOUR_GEMINI_API_KEY_HERE';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

async function listModels() {
  console.log('--- Fetching Available Models ---');
  const response = await fetch(`${BASE_URL}/models?key=${API_KEY}`);
  if (!response.ok) {
    console.error('Failed to fetch models:', response.status, await response.text());
    return;
  }
  const data = await response.json();
  const models = data.models || [];
  
  const liveModels = models.filter((m: any) => m.name.includes('live') || m.name.includes('native') || m.name.includes('audio'));
  console.log('Found specific models requested by user:');
  liveModels.forEach((m: any) => {
    console.log(`- Name: ${m.name}`);
    console.log(`  Display Name: ${m.displayName}`);
    console.log(`  Description: ${m.description}`);
    console.log(`  Supported Generation Methods: ${m.supportedGenerationMethods.join(', ')}`);
  });

  const flashModels = models.filter((m: any) => m.name.includes('flash') && !m.name.includes('live') && !m.name.includes('native'));
  console.log('\nOther Flash Models:');
  flashModels.forEach((m: any) => {
    console.log(`- Name: ${m.name}`);
    console.log(`  Supported Generation Methods: ${m.supportedGenerationMethods.join(', ')}`);
  });
}

async function testModel(modelName: string) {
  console.log(`\n--- Testing Model: ${modelName} ---`);
  const url = `${BASE_URL}/${modelName}:generateContent?key=${API_KEY}`;
  
  const payload = {
    contents: [{ parts: [{ text: 'Hello, testing your endpoint.' }] }]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (response.ok) {
    const data = await response.json();
    console.log(`✅ Success! Model ${modelName} accepted standard generateContent POST request.`);
    console.log(`Response text preview: ${data.candidates[0]?.content?.parts[0]?.text.substring(0, 50)}...`);
  } else {
    console.log(`❌ Failed! Model ${modelName} rejected the request.`);
    console.log(`Status: ${response.status}`);
    console.log(`Error:`, await response.text());
  }
}

async function main() {
  await listModels();
  
  console.log('\n--- Now testing actual endpoint behavior ---');
  // Test standard flash
  await testModel('models/gemini-2.5-flash');
  
  // Test native audio latest
  await testModel('models/gemini-2.5-flash-native-audio-latest');
  
  // Test live model (if exists, checking exact name user gave or closest match)
  // Usually it is something like models/gemini-3.0-flash-live or gemini-2.5-flash-live
  // We'll test a few variations if we aren't sure, but listModels will show the exact names.
  
  // We can just use the official live model name:
  // "gemini-2.0-flash-exp" (The live api currently supports gemini-2.0-flash-exp)
  // We will test gemini-3.0-flash-live if it exists from list, wait list will tell us.
}

main().catch(console.error);
