import fs from "fs";
import path from "path";

const CACHE_VERSION = "v1.0";
const CACHE_DIR = process.env.CHAIN_ASSETS_CACHE_DIR || path.join(__dirname, ".chain-assets-cache");
const VERSIONED_CACHE_DIR = path.join(CACHE_DIR, CACHE_VERSION);

const pathExistsMap: { [key: string]: Promise<void> } = {};

async function ensureDirExists(folder: string): Promise<void> {
  if (!pathExistsMap[folder]) {
    pathExistsMap[folder] = (async () => {
      try {
        await fs.promises.access(folder);
      } catch {
        try {
          await fs.promises.mkdir(folder, { recursive: true });
        } catch (e) {
          console.error("Error creating directory:", (e as any)?.message);
        }
      }
    })();
  }
  return pathExistsMap[folder];
}

async function storeData(subPath: string, data: any): Promise<void> {
  const filePath = path.join(VERSIONED_CACHE_DIR, subPath);
  await ensureDirExists(path.dirname(filePath));
  // Write to a temp file in the same directory and rename, so a crash mid-write
  // can't leave a truncated/empty cache file in place.
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.promises.writeFile(tmpPath, JSON.stringify(data));
    await fs.promises.rename(tmpPath, filePath);
  } catch (e) {
    console.error(`Error storing cache ${filePath}:`, (e as any)?.message);
    fs.promises.unlink(tmpPath).catch(() => {});
  }
}

async function readData(subPath: string): Promise<any> {
  const filePath = path.join(VERSIONED_CACHE_DIR, subPath);
  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Strip anything that could escape the cache directory (slashes, dots, control
// chars) before the chain name is interpolated into a file path. Dashes and
// underscores stay so existing chain keys like "polygon-zkevm" round-trip.
function normalizeChain(chain: string): string {
  const cleaned = (chain ?? "").replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase();
  return cleaned || "unknown";
}

export async function storeChainHistory(chain: string, data: any[]): Promise<void> {
  await storeData(`history/${normalizeChain(chain)}.json`, data);
}

export async function readChainHistory(chain: string): Promise<any[] | null> {
  return readData(`history/${normalizeChain(chain)}.json`);
}

export async function storeAllChainsHistory(data: any[]): Promise<void> {
  await storeData("history/all.json", data);
}

export async function readAllChainsHistory(): Promise<any[] | null> {
  return readData("history/all.json");
}
