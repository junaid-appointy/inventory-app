declare module 'jpeg-js' {
  export function decode(
    data: Uint8Array | ArrayBuffer,
    opts?: { useTArray?: boolean; formatAsRGBA?: boolean },
  ): { width: number; height: number; data: Uint8Array };
  export function encode(
    imgData: { data: Uint8Array; width: number; height: number },
    quality?: number,
  ): { data: Uint8Array; width: number; height: number };
}
