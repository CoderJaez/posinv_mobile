import * as Crypto from 'expo-crypto';

const PIN_PEPPER = 'storemate';

export async function hashPin(pin: string) {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${PIN_PEPPER}:${pin}`
  );

  return `sha256:${digest}`;
}

export async function verifyPin(pin: string, hash: string) {
  return hash === (await hashPin(pin));
}
