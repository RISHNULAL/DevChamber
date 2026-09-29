import * as Y from 'yjs';
import { WorkspaceFile } from '../models/index.js';

interface CachedYDoc {
  doc: Y.Doc;
  workspaceId: string;
  fileName: string;
  lastSavedContent: string;
  saveTimer?: NodeJS.Timeout;
}

const activeDocs = new Map<string, CachedYDoc>();

function getDocKey(workspaceId: string, fileName: string): string {
  return `${workspaceId}:${fileName}`;
}

/**
 * Get or load an in-memory Yjs document for a given workspace file.
 */
export async function getOrCreateYDoc(workspaceId: string, fileName: string): Promise<Y.Doc> {
  const docKey = getDocKey(workspaceId, fileName);
  const existing = activeDocs.get(docKey);
  if (existing) {
    return existing.doc;
  }

  const doc = new Y.Doc();
  const ytext = doc.getText('monaco');

  // Load latest content from MongoDB
  const file = await WorkspaceFile.findOne({ workspaceId, name: fileName }).lean();
  const initialContent = file ? file.content : '';
  if (initialContent) {
    ytext.insert(0, initialContent);
  }

  const cached: CachedYDoc = {
    doc,
    workspaceId,
    fileName,
    lastSavedContent: initialContent,
  };

  // Debounced auto-persistence to MongoDB
  doc.on('update', () => {
    if (cached.saveTimer) {
      clearTimeout(cached.saveTimer);
    }
    cached.saveTimer = setTimeout(async () => {
      try {
        const currentContent = ytext.toString();
        if (currentContent !== cached.lastSavedContent) {
          cached.lastSavedContent = currentContent;
          await WorkspaceFile.findOneAndUpdate(
            { workspaceId, name: fileName },
            { content: currentContent, updatedAt: new Date() },
            { upsert: true }
          );
        }
      } catch (err) {
        console.error(`[YjsManager] Auto-save error for ${docKey}:`, err);
      }
    }, 1000);
  });

  activeDocs.set(docKey, cached);
  return doc;
}

/**
 * Apply a binary/array update to the server Yjs doc and persist if needed.
 */
export async function applyYDocUpdate(
  workspaceId: string,
  fileName: string,
  update: Uint8Array | number[]
): Promise<void> {
  const doc = await getOrCreateYDoc(workspaceId, fileName);
  const updateArray = update instanceof Uint8Array ? update : new Uint8Array(update);
  Y.applyUpdate(doc, updateArray, 'remote');
}

/**
 * Get current document state as a full update payload.
 */
export async function getYDocState(workspaceId: string, fileName: string): Promise<number[]> {
  const doc = await getOrCreateYDoc(workspaceId, fileName);
  const stateUpdate = Y.encodeStateAsUpdate(doc);
  return Array.from(stateUpdate);
}

/**
 * Get the current text content of a Yjs document.
 */
export async function getYDocText(workspaceId: string, fileName: string): Promise<string> {
  const doc = await getOrCreateYDoc(workspaceId, fileName);
  return doc.getText('monaco').toString();
}

/**
 * Explicitly flush/save a Yjs doc to MongoDB immediately.
 */
export async function flushYDoc(workspaceId: string, fileName: string): Promise<string> {
  const docKey = getDocKey(workspaceId, fileName);
  const cached = activeDocs.get(docKey);
  const doc = cached ? cached.doc : await getOrCreateYDoc(workspaceId, fileName);
  const currentContent = doc.getText('monaco').toString();

  await WorkspaceFile.findOneAndUpdate(
    { workspaceId, name: fileName },
    { content: currentContent, updatedAt: new Date() },
    { upsert: true }
  );

  if (cached) {
    if (cached.saveTimer) clearTimeout(cached.saveTimer);
    cached.lastSavedContent = currentContent;
  }

  return currentContent;
}

/**
 * Invalidate cached doc on file deletion.
 */
export function removeYDoc(workspaceId: string, fileName: string): void {
  const docKey = getDocKey(workspaceId, fileName);
  const cached = activeDocs.get(docKey);
  if (cached) {
    if (cached.saveTimer) clearTimeout(cached.saveTimer);
    cached.doc.destroy();
    activeDocs.delete(docKey);
  }
}

/**
 * Rename cached doc when a file is renamed.
 */
export async function renameYDoc(
  workspaceId: string,
  oldFileName: string,
  newFileName: string
): Promise<void> {
  const oldKey = getDocKey(workspaceId, oldFileName);
  const cached = activeDocs.get(oldKey);
  if (cached) {
    if (cached.saveTimer) clearTimeout(cached.saveTimer);
    activeDocs.delete(oldKey);
    cached.fileName = newFileName;
    activeDocs.set(getDocKey(workspaceId, newFileName), cached);
  }
}
