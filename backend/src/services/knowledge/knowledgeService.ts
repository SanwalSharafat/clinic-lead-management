import * as fs from 'fs';
import * as path from 'path';

const KNOWLEDGE_DIR_DIST = path.resolve(__dirname, '../../knowledge');
const KNOWLEDGE_DIR_DEV = path.resolve(process.cwd(), 'knowledge');
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function resolveKnowledgeDir(): string {
  // Prefer the dist-relative path (production); fall back to cwd-relative (development)
  if (fs.existsSync(KNOWLEDGE_DIR_DIST)) {
    return KNOWLEDGE_DIR_DIST;
  }
  return KNOWLEDGE_DIR_DEV;
}

export class KnowledgeService {
  private context: string | null = null;
  private lastLoaded: number = 0;
  private readonly CACHE_TTL = CACHE_TTL_MS;

  async loadContext(): Promise<string> {
    const now = Date.now();
    if (this.context !== null && now - this.lastLoaded < this.CACHE_TTL) {
      return this.context;
    }

    this.context = await this.readAllFiles();
    this.lastLoaded = now;
    return this.context;
  }

  invalidateCache(): void {
    this.context = null;
    this.lastLoaded = 0;
  }

  private async readAllFiles(): Promise<string> {
    const knowledgeDir = resolveKnowledgeDir();

    let entries: string[];
    try {
      entries = await fs.promises.readdir(knowledgeDir);
    } catch (err) {
      throw new Error(
        `Knowledge directory not found or not readable at "${knowledgeDir}". ${(err as Error).message}`,
      );
    }

    const mdFiles = entries
      .filter((entry) => entry.endsWith('.md'))
      .sort();

    if (mdFiles.length === 0) {
      throw new Error(
        `No markdown files found in knowledge directory "${knowledgeDir}".`,
      );
    }

    const contents: string[] = [];

    for (const filename of mdFiles) {
      const filePath = path.join(knowledgeDir, filename);
      try {
        const data = await fs.promises.readFile(filePath, 'utf-8');
        contents.push(data.trim());
      } catch (err) {
        console.warn(
          `[KnowledgeService] Failed to read file "${filePath}": ${(err as Error).message}. Skipping.`,
        );
      }
    }

    if (contents.length === 0) {
      throw new Error(
        `All markdown files in "${knowledgeDir}" failed to load. No knowledge context available.`,
      );
    }

    return contents.join('\n\n');
  }
}
