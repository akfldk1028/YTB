const fetch = require('node-fetch').default || require('node-fetch');
const fs = require('fs');

const apiKey = 'AIzaSyByYlQcOJ_Oj2WVbKIMtmmYfGftMEOG4RI';
const model = 'gemini-2.5-pro-preview-tts';
const text = '마지막, 민간 드론이 북한 넘어갔는데 군이 몰랐대. 두 번이나 경계선 넘었는데 허가된 비행도 아니었대.';
const voice = 'Aoede'; // 여성, 밝고 생동감 있는 목소리

async function test() {
  console.log('=== Gemini Pro TTS 테스트 ===');
  console.log('모델:', model);
  console.log('음성:', voice);
  console.log('텍스트:', text);
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice }
          }
        }
      }
    })
  });
  
  if (!response.ok) {
    const err = await response.text();
    console.error('에러:', err);
    return;
  }
  
  const data = await response.json();
  const audioData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  
  if (!audioData) {
    console.error('오디오 데이터 없음:', JSON.stringify(data, null, 2));
    return;
  }
  
  // PCM to WAV 변환 (24kHz, 16-bit, mono)
  const pcmBuffer = Buffer.from(audioData, 'base64');
  const wavBuffer = createWavHeader(pcmBuffer, 24000, 16, 1);
  
  fs.writeFileSync('test_gemini_pro.wav', wavBuffer);
  console.log('\n✅ 저장됨: test_gemini_pro.wav');
  console.log('크기:', (wavBuffer.length / 1024).toFixed(2), 'KB');
  console.log('예상 길이:', (pcmBuffer.length / (24000 * 2)).toFixed(2), '초');
}

function createWavHeader(pcmData, sampleRate, bitsPerSample, channels) {
  const dataSize = pcmData.length;
  const header = Buffer.alloc(44);
  
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * bitsPerSample / 8, 28);
  header.writeUInt16LE(channels * bitsPerSample / 8, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  
  return Buffer.concat([header, pcmData]);
}

test().catch(console.error);
