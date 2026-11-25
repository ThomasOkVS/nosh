declare module "heic-decode" {
  type Decoded = { width: number; height: number; data: Uint8ClampedArray };
  type Lazy = { width: number; height: number; decode(): Promise<Decoded> };
  type Input = { buffer: Uint8Array };
  function decode(input: Input): Promise<Decoded>;
  namespace decode {
    function all(input: Input): Promise<Lazy[] & { dispose(): void }>;
  }
  export = decode;
}
