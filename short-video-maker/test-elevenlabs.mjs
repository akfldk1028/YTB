import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

const client = new ElevenLabsClient({
  apiKey: 'sk_3dfd74fb688c4910a307310b7cf3d0095149afa102135c5d'
});

async function test() {
  try {
    console.log('Testing ElevenLabs API...');
    
    // Test user endpoint
    const user = await client.user.get();
    console.log('User:', JSON.stringify(user, null, 2));
    
    // Test TTS
    console.log('Testing TTS...');
    const audio = await client.textToSpeech.convert('21m00Tcm4TlvDq8ikWAM', {
      text: 'Hello world',
      model_id: 'eleven_multilingual_v2'
    });
    
    // Read stream
    const reader = audio.getReader();
    let chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    
    console.log('TTS successful! Audio length:', chunks.length);
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.body) {
      console.error('Body:', error.body);
    }
  }
}

test();