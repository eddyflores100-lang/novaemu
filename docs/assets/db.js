/* NovaEmu — IndexedDB compartido ("novaemu-fs"): ROM pendiente + BIOS por sistema.
 * Todo queda en el dispositivo del usuario; nada se sube a ningún servidor. */
export function openFilesDB() {
  return new Promise((res, rej) => {
    const rq = indexedDB.open("novaemu-fs", 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore("files");
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}

export async function idbGet(key) {
  const db = await openFilesDB();
  return new Promise((res, rej) => {
    const tx = db.transaction("files", "readonly");
    const rq = tx.objectStore("files").get(key);
    rq.onsuccess = () => res(rq.result ?? null);
    rq.onerror = () => rej(rq.error);
  });
}

export async function idbPut(key, value) {
  const db = await openFilesDB();
  return new Promise((res, rej) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(value, key);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
