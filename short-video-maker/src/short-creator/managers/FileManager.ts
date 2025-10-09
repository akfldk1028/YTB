import fs from "fs-extra";
import path from "path";
import https from "https";
import http from "http";
import { logger } from "../../logger";

export class FileManager {
  constructor(private tempDirPath: string) {}

  async downloadFile(url: string, outputPath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const fileStream = fs.createWriteStream(outputPath);
      const downloadUrl = url.startsWith("http://") ? http : https;
      
      downloadUrl
        .get(url, (response: http.IncomingMessage) => {
          // Handle redirects
          if (this.isRedirect(response.statusCode)) {
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
              logger.debug(`Following redirect to: ${redirectUrl}`);
              fileStream.close();
              fs.unlinkSync(outputPath);
              
              // Recursively follow the redirect
              const redirectProtocol = redirectUrl.startsWith("http://") ? http : https;
              redirectProtocol.get(redirectUrl, (redirectResponse: http.IncomingMessage) => {
                if (redirectResponse.statusCode !== 200) {
                  reject(new Error(`Failed to download file: ${redirectResponse.statusCode}`));
                  return;
                }
                
                const newFileStream = fs.createWriteStream(outputPath);
                redirectResponse.pipe(newFileStream);
                
                newFileStream.on("finish", () => {
                  newFileStream.close();
                  logger.debug(`File downloaded successfully to ${outputPath}`);
                  resolve();
                });
              }).on("error", (err: Error) => {
                fs.unlink(outputPath, () => {});
                logger.error(err, "Error downloading file from redirect:");
                reject(err);
              });
              return;
            }
          }
          
          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download file: ${response.statusCode}`));
            return;
          }

          response.pipe(fileStream);

          fileStream.on("finish", () => {
            fileStream.close();
            logger.debug(`File downloaded successfully to ${outputPath}`);
            resolve();
          });
        })
        .on("error", (err: Error) => {
          fs.unlink(outputPath, () => {});
          logger.error(err, "Error downloading file:");
          reject(err);
        });
    });
  }

  async ensureDir(dirPath: string): Promise<void> {
    await fs.ensureDir(dirPath);
  }

  createTempPath(filename: string): string {
    return path.join(this.tempDirPath, filename);
  }

  async cleanupFiles(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      try {
        if (fs.existsSync(filePath)) {
          await fs.unlink(filePath);
          logger.debug({ filePath }, "Cleaned up temporary file");
        }
      } catch (error) {
        logger.warn(error, `Failed to cleanup file: ${filePath}`);
      }
    }
  }

  async cleanupDirectory(dirPath: string): Promise<void> {
    try {
      if (fs.existsSync(dirPath)) {
        await fs.remove(dirPath);
        logger.debug({ dirPath }, "Cleaned up directory");
      }
    } catch (error) {
      logger.warn(error, `Failed to cleanup directory: ${dirPath}`);
    }
  }

  private isRedirect(statusCode?: number): boolean {
    return statusCode === 301 || statusCode === 302 || 
           statusCode === 303 || statusCode === 307 || 
           statusCode === 308;
  }

  fileExists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  async readFile(filePath: string): Promise<Buffer> {
    return fs.readFile(filePath);
  }

  async writeFile(filePath: string, data: Buffer | string): Promise<void> {
    await fs.writeFile(filePath, data);
  }

  getFileStats(filePath: string): fs.Stats | null {
    try {
      return fs.statSync(filePath);
    } catch {
      return null;
    }
  }
}