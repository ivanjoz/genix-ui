// AES-GCM decryption for payloads the backend ciphers with a per-login key.
// The nonce is prepended to the ciphertext, matching Go's cipher.AEAD.Seal output layout.
const NONCE_LENGTH = 12;
const AES_KEY_LENGTH = 32;

export const decrypt = async (encryptedBase64: string, cipherKey: string): Promise<string> => {
  const encryptedBytes = Uint8Array.from(atob(encryptedBase64), (char) => char.charCodeAt(0));
  if (encryptedBytes.length <= NONCE_LENGTH) {
    throw new Error('Invalid encrypted data');
  }

  const keyBuffer = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(cipherKey.substring(0, AES_KEY_LENGTH)),
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );

  const nonce = encryptedBytes.slice(0, NONCE_LENGTH);
  const ciphertext = encryptedBytes.slice(NONCE_LENGTH);

  try {
    const decryptedData = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce },
      keyBuffer,
      ciphertext,
    );
    return new TextDecoder().decode(decryptedData);
  } catch (decryptError) {
    console.error('[crypto] Could not decrypt payload:', decryptError);
    return '';
  }
};
