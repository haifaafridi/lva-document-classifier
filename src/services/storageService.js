import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { BlobServiceClient } from '@azure/storage-blob';
import { env, requireAzureEnv } from '../config/env.js';
import { safeOriginalName } from '../utils/text.js';

let azureService;
let azureContainer;
let azureContainerReady;

function makeBlobName(originalName) {
  const date = new Date().toISOString().slice(0, 10);
  return `${date}/${crypto.randomUUID()}-${safeOriginalName(originalName)}`;
}

async function saveLocal(buffer, originalName) {
  await mkdir(env.localUploadDir, { recursive: true });
  const filename = `${crypto.randomUUID()}-${safeOriginalName(originalName)}`;
  const fullPath = path.join(env.localUploadDir, filename);
  await writeFile(fullPath, buffer);
  return { provider: 'local', key: filename, location: fullPath };
}

async function getAzureContainer() {
  requireAzureEnv();
  if (!azureService) azureService = BlobServiceClient.fromConnectionString(env.azureConnectionString);
  if (!azureContainer) azureContainer = azureService.getContainerClient(env.azureContainer);
  // Creating/checking the same container for every upload adds an avoidable network call.
  // Cache the one-time readiness check for the lifetime of the Node process.
  if (!azureContainerReady) {
    azureContainerReady = azureContainer.createIfNotExists().catch((error) => {
      azureContainerReady = undefined;
      throw error;
    });
  }
  await azureContainerReady;
  return azureContainer;
}

async function saveAzure(buffer, originalName, mimetype) {
  const container = await getAzureContainer();
  const blobName = makeBlobName(originalName);
  const blob = container.getBlockBlobClient(blobName);
  await blob.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: mimetype || 'application/octet-stream' },
  });
  return { provider: 'azure', key: blobName, location: blob.url };
}

export async function storeDocument(buffer, originalName, mimetype) {
  if (env.storageMode === 'azure') return saveAzure(buffer, originalName, mimetype);
  if (env.storageMode === 'local') return saveLocal(buffer, originalName);
  throw new Error(`Unsupported STORAGE_MODE: ${env.storageMode}`);
}

export async function readStoredDocument(stored) {
  if (stored.provider === 'local') return readFile(stored.location);
  if (stored.provider === 'azure') {
    const container = await getAzureContainer();
    const blob = container.getBlockBlobClient(stored.key);
    return blob.downloadToBuffer();
  }
  throw new Error(`Unsupported storage provider: ${stored.provider}`);
}


// Resolve storage configuration during application startup. For Azure this creates
// the reusable client/container objects and completes the one-time container check.
export async function warmStorage() {
  if (env.storageMode === 'azure') {
    await getAzureContainer();
    return { provider: 'azure', ready: true };
  }
  if (env.storageMode === 'local') {
    await mkdir(env.localUploadDir, { recursive: true });
    return { provider: 'local', ready: true };
  }
  throw new Error(`Unsupported STORAGE_MODE: ${env.storageMode}`);
}
