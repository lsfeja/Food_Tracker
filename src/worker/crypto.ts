/**
 * AES-GCM encryption for OAuth tokens at rest in D1. The key is derived (SHA-256)
 * from the TOKEN_ENCRYPTION_KEY secret. Format: "v1:" + base64(iv ‖ ciphertext).
 */
const keys = new Map<string, Promise<CryptoKey>>();

function key(secret: string): Promise<CryptoKey> {
  let value = keys.get(secret);
  if (!value) {
    value = crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(`foodtracker-token-key:${secret}`))
      .then((raw) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]));
    keys.set(secret, value);
  }
  return value;
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export async function encrypt(plaintext: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(secret), new TextEncoder().encode(plaintext)));
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv);
  combined.set(ciphertext, iv.length);
  return `v1:${toBase64(combined)}`;
}

export async function decrypt(value: string, secret: string): Promise<string> {
  if (!value.startsWith("v1:")) throw new Error("Unknown token format");
  const combined = fromBase64(value.slice(3));
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: combined.slice(0, 12) }, await key(secret), combined.slice(12));
  return new TextDecoder().decode(plaintext);
}
