declare module "ipp" {
  export interface IppResponse {
    statusCode: string;
    [key: string]: unknown;
  }

  export class Printer {
    constructor(uri: string);
    execute(
      operation: string,
      message: Record<string, unknown>,
      callback: (err: Error | null, response: IppResponse) => void
    ): void;
  }

  const ipp: { Printer: typeof Printer };
  export default ipp;
}
