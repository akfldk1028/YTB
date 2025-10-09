// Kokoro is disabled due to phonemizer crash issues
// import { KokoroTTS, TextSplitterStream } from "kokoro-js";
import {
  VoiceEnum,
  type kokoroModelPrecision,
  type Voices,
} from "../../types/shorts";
import { KOKORO_MODEL, logger } from "../../config";

export class Kokoro {
  constructor(private tts: any) {
    throw new Error("Kokoro TTS is disabled due to phonemizer issues. Use ElevenLabs or Google TTS instead.");
  }

  async generate(
    text: string,
    voice: Voices,
  ): Promise<{
    audio: ArrayBuffer;
    audioLength: number;
  }> {
    throw new Error("Kokoro TTS is disabled due to phonemizer issues. Use ElevenLabs or Google TTS instead.");
  }

  static concatWavBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
    const header = Buffer.from(buffers[0].slice(0, 44));
    let totalDataLength = 0;

    const dataParts = buffers.map((buf) => {
      const b = Buffer.from(buf);
      const data = b.slice(44);
      totalDataLength += data.length;
      return data;
    });

    header.writeUInt32LE(36 + totalDataLength, 4);
    header.writeUInt32LE(totalDataLength, 40);

    return Buffer.concat([header, ...dataParts]).buffer;
  }

  static async init(dtype: kokoroModelPrecision): Promise<Kokoro> {
    throw new Error("Kokoro TTS is disabled due to phonemizer issues. Use ElevenLabs or Google TTS instead.");
  }

  listAvailableVoices(): Voices[] {
    const voices = Object.values(VoiceEnum) as Voices[];
    return voices;
  }
}
