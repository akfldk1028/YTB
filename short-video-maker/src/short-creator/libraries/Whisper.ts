import {
  downloadWhisperModel,
  installWhisperCpp,
} from "@remotion/install-whisper-cpp";
import path from "path";
import { execSync } from "child_process";
import fs from "fs";

import { Config } from "../../config";
import type { Caption } from "../../types/shorts";
import { logger } from "../../logger";

export const ErrorWhisper = new Error("There was an error with WhisperCpp");

export class Whisper {
  constructor(private config: Config) {}

  static async init(config: Config): Promise<Whisper> {
    if (!config.runningInDocker) {
      logger.debug("Installing WhisperCpp");
      await installWhisperCpp({
        to: config.whisperInstallPath,
        version: config.whisperVersion,
        printOutput: true,
      });
      logger.debug("WhisperCpp installed");
      logger.debug("Downloading Whisper model");
      await downloadWhisperModel({
        model: config.whisperModel,
        folder: path.join(config.whisperInstallPath, "models"),
        printOutput: config.whisperVerbose,
        onProgress: (downloadedBytes, totalBytes) => {
          const progress = `${Math.round((downloadedBytes / totalBytes) * 100)}%`;
          logger.debug(
            { progress, model: config.whisperModel },
            "Downloading Whisper model",
          );
        },
      });
      // todo run the jfk command to check if everything is ok
      logger.debug("Whisper model downloaded");
    }

    return new Whisper(config);
  }

  // Direct whisper.cpp CLI call for Korean language support
  async CreateCaption(audioPath: string): Promise<Caption[]> {
    logger.debug({ audioPath }, "Starting to transcribe audio with direct whisper.cpp CLI");
    
    const whisperExecutable = path.join(this.config.whisperInstallPath, "main");
    const modelPath = path.join(this.config.whisperInstallPath, "models", `ggml-${this.config.whisperModel}.bin`);
    const outputJsonPath = audioPath.replace('.wav', '_whisper_output.json');
    
    try {
      // Build whisper command with Korean language and no translation
      const command = `"${whisperExecutable}" -m "${modelPath}" -l ko -oj -of "${outputJsonPath.replace('.json', '')}" "${audioPath}"`;
      
      logger.debug({ command }, "Executing whisper command");
      
      // Execute whisper.cpp directly
      const output = execSync(command, { 
        encoding: 'utf8',
        timeout: 60000 // 60 second timeout
      });
      
      logger.debug({ output }, "Whisper command completed");
      
      // Read the JSON output file
      const jsonOutputPath = outputJsonPath;
      if (!fs.existsSync(jsonOutputPath)) {
        throw new Error(`Whisper output file not found: ${jsonOutputPath}`);
      }
      
      const whisperResult = JSON.parse(fs.readFileSync(jsonOutputPath, 'utf8'));
      logger.debug({ whisperResult }, "Whisper JSON result parsed");
      
      // Convert whisper output to Caption format
      const captions: Caption[] = [];
      
      if (whisperResult.transcription) {
        whisperResult.transcription.forEach((segment: any) => {
          if (segment.text && segment.text.trim() !== "") {
            // Split by words and create individual captions for better timing
            const words = segment.text.trim().split(/\s+/);
            const segmentDuration = (segment.offsets.to - segment.offsets.from);
            const wordDuration = segmentDuration / words.length;
            
            words.forEach((word: string, index: number) => {
              const startMs = segment.offsets.from + (index * wordDuration);
              const endMs = segment.offsets.from + ((index + 1) * wordDuration);
              
              captions.push({
                text: word,
                startMs: Math.round(startMs),
                endMs: Math.round(endMs),
              });
            });
          }
        });
      }
      
      // Clean up output file
      try {
        fs.unlinkSync(jsonOutputPath);
      } catch (cleanupError) {
        logger.warn({ cleanupError }, "Failed to cleanup whisper output file");
      }
      
      logger.debug({ audioPath, captionCount: captions.length }, "Korean captions created successfully");
      return captions;
      
    } catch (error) {
      logger.error({ error, audioPath }, "Error in direct whisper transcription");
      throw new Error(`Whisper transcription failed: ${error}`);
    }
  }
}
