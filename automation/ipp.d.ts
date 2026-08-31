/**
 * O pacote `ipp` não publica tipos e não existe `@types/ipp`, então o import
 * em `automation/print/printClient.ts` caía em `any` implícito e quebrava
 * qualquer checagem com `--strict`. Ficou invisível porque `automation/` não
 * entra em nenhum tsconfig — ver "Testes" no CLAUDE.md.
 *
 * Declarado só o que printClient.ts usa de fato (Printer + execute), em vez de
 * `declare module "ipp"` vazio: um módulo vazio devolveria `any` de novo e o
 * arquivo voltaria a passar sem checagem nenhuma.
 */
declare module "ipp" {
  export interface PrinterResponse {
    version?: string;
    statusCode?: string;
    id?: number;
    "operation-attributes-tag"?: Record<string, unknown>;
    "job-attributes-tag"?: Record<string, unknown>;
    [key: string]: unknown;
  }

  export class Printer {
    constructor(url: string, options?: Record<string, unknown>);
    execute(
      operation: string,
      request: Record<string, unknown>,
      callback: (err: Error | null, res: PrinterResponse) => void
    ): void;
  }
}
