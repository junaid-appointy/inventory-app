import { config } from '../config';
import { getDeviceId } from '../utils/device';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const deviceId = await getDeviceId();
  const res = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': deviceId,
      'X-Site-Id': config.siteId,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  postReceipt: (payload: object) =>
    request<{ id: string }>(`/v1/capture/receipt`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  postProduct: (payload: object) =>
    request<{ barcode: string }>(`/v1/capture/product`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
