import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import ipp from "ipp";

/**
 * UMA VIA por pedido, de propósito: cada folha é grampeada com o pedido
 * correspondente na câmara fria, então via dupla só duplicaria papel sem
 * função. (No projeto irmão, o PDV, a loja pede 2 vias por decisão própria —
 * não é o mesmo caso.)
 */
const COPIES = 1;

const execFileAsync = promisify(execFile);

/**
 * Confirmado ao vivo (pdv-gostinho-mineiro, 2026-08-03): as impressoras da
 * loja (HP Laser 408) NÃO aceitam "application/pdf" por IPP — só octet-stream,
 * text/plain, PCL, PCLXL, PostScript, HP-SPL e PCLm. Mandar o PDF cru como
 * "application/pdf" é recusado; mandar como "application/octet-stream" é
 * PIOR — o job é aceito e a impressora tenta interpretar os bytes do PDF como
 * se já fossem comandos PCL/PostScript, produzindo lixo impresso. Converter
 * para PostScript de verdade (com cupsfilter) resolve.
 *
 * "-o media=A4" NÃO é opcional: sem isso, o PPD assume Letter e a impressora
 * pode "completar" o job por IPP sem nunca produzir uma página física — sem
 * erro em lugar nenhum.
 */
const PDF_TO_PS_CONVERTERS = [
  { cmd: "cupsfilter", args: (p: string) => ["-m", "application/postscript", "-o", "media=A4", p] },
  { cmd: "pdftops", args: (p: string) => ["-paper", "A4", p, "-"] },
];

// Qual conversor funcionou aqui, lembrado após a primeira folha, para não
// pagar o custo de um cupsfilter quebrado a cada impressão.
let workingConverter: (typeof PDF_TO_PS_CONVERTERS)[number] | null = null;

/**
 * Um conversor que "deu certo" tem que ter produzido PostScript de verdade —
 * cupsfilter pode sair com stdout VAZIO sem erro quando não acha o PPD, e
 * isso não pode ser confundido com sucesso (a impressora aceitaria um
 * documento em branco e diria "completed successfully").
 */
function ehPostScriptValido(saida: Buffer): boolean {
  return saida.length > 0 && saida.subarray(0, 2).toString("latin1") === "%!";
}

async function pdfToPostScript(pdf: Buffer): Promise<Buffer> {
  const tmpPath = join(tmpdir(), `gm-portaria-${randomUUID()}.pdf`);
  await writeFile(tmpPath, pdf);
  try {
    const candidates = workingConverter ? [workingConverter] : PDF_TO_PS_CONVERTERS;
    const failures: string[] = [];

    for (const converter of candidates) {
      try {
        const { stdout } = await execFileAsync(converter.cmd, converter.args(tmpPath), {
          encoding: "buffer",
          maxBuffer: 20 * 1024 * 1024,
        });
        const saida = stdout as unknown as Buffer;
        if (!ehPostScriptValido(saida)) {
          failures.push(`${converter.cmd}: terminou sem erro mas não produziu PostScript (${saida.length} bytes)`);
          continue;
        }
        workingConverter = converter;
        return saida;
      } catch (err) {
        failures.push(`${converter.cmd}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    workingConverter = null;
    throw new Error(
      `Falha ao converter a folha para PostScript. Instale o CUPS (cupsfilter) ou o poppler-utils (pdftops). Tentativas — ${failures.join(" | ")}`
    );
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

const IPP_TIMEOUT_MS = 15_000;
// 60s, medido no PDV (não chutado): uma HP saindo do modo de espera levou
// 22,5s para concluir uma folha de 258KB.
const JOB_WAIT_MS = 60_000;
const JOB_POLL_MS = 1_000;

interface RespostaIpp {
  statusCode: string;
  "job-attributes-tag"?: Record<string, unknown>;
}

function ippExecute(host: string, operacao: string, mensagem: Record<string, unknown>): Promise<RespostaIpp> {
  return new Promise((resolve, reject) => {
    const printer = new ipp.Printer(`http://${host}:631/ipp/print`);
    const timer = setTimeout(
      () => reject(new Error(`A impressora ${host} não respondeu em ${IPP_TIMEOUT_MS / 1000}s (${operacao}).`)),
      IPP_TIMEOUT_MS
    );
    printer.execute(operacao, mensagem as never, (err: Error | null, res: RespostaIpp) => {
      clearTimeout(timer);
      if (err) return reject(new Error(erroDeRedeLegivel(host, err)));
      resolve(res);
    });
  });
}

function erroDeRedeLegivel(host: string, err: Error): string {
  const codigo = (err as NodeJS.ErrnoException).code ?? "";
  if (codigo === "ECONNREFUSED") {
    return `A impressora ${host} recusou a conexão — confira se ela está ligada e na rede.`;
  }
  if (codigo === "EHOSTUNREACH" || codigo === "ENETUNREACH" || codigo === "ENOTFOUND") {
    return `A impressora ${host} não foi encontrada na rede — confira se está ligada e com o cabo/Wi-Fi conectado.`;
  }
  if (codigo === "ETIMEDOUT" || codigo === "ECONNRESET") {
    return `A conexão com a impressora ${host} caiu no meio do envio — a próxima checagem tenta de novo.`;
  }
  return err.message;
}

function motivoLegivel(razao: unknown): string {
  const texto = String(razao ?? "").toLowerCase();
  if (texto.includes("media-empty") || texto.includes("media-needed")) return "a impressora está sem papel";
  if (texto.includes("media-jam")) return "há papel enroscado na impressora";
  if (texto.includes("cover-open") || texto.includes("door-open")) return "a tampa da impressora está aberta";
  if (texto.includes("toner-empty") || texto.includes("marker-supply-empty")) return "o toner acabou";
  if (texto.includes("offline") || texto.includes("shutdown")) return "a impressora está desligada ou fora de linha";
  if (texto.includes("resources-are-not-ready")) return "a impressora não está pronta (papel, tampa ou modo de espera)";
  if (texto.includes("printer-stopped")) return "a impressora está parada";
  return texto && texto !== "none" ? `a impressora informou "${texto}"` : "a impressora não informou o motivo";
}

/**
 * Espera o job chegar a um estado terminal e devolve o que REALMENTE
 * aconteceu. `Print-Job` volta `successful-ok` assim que a impressora recebe
 * o arquivo — não quando ela termina de imprimir. Só `Get-Job-Attributes`
 * confirma.
 */
async function aguardarJob(host: string, jobId: number): Promise<void> {
  const limite = Date.now() + JOB_WAIT_MS;
  let ultimaRazao: unknown = null;
  let chegouAImprimir = false;

  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, JOB_POLL_MS));

    let atributos: Record<string, unknown>;
    try {
      const res = await ippExecute(host, "Get-Job-Attributes", {
        "operation-attributes-tag": {
          "requesting-user-name": "portaria",
          "job-id": jobId,
          "requested-attributes": ["job-state", "job-state-reasons"],
        },
      });
      atributos = res["job-attributes-tag"] ?? {};
    } catch {
      // A impressora tira o job do histórico assim que ele termina — depois
      // de já tê-lo visto na fila isso é fim normal, não falha.
      return;
    }

    const estado = String(atributos["job-state"] ?? "");
    ultimaRazao = atributos["job-state-reasons"] ?? ultimaRazao;
    if (estado === "processing") chegouAImprimir = true;

    if (estado === "completed") return;
    if (estado === "aborted" || estado === "canceled") {
      throw new Error(`A impressora ${host} cancelou a impressão: ${motivoLegivel(ultimaRazao)}.`);
    }
  }

  if (chegouAImprimir) {
    console.warn(
      `[print] ${host}: job ${jobId} passou de ${JOB_WAIT_MS / 1000}s ainda imprimindo — não deu para confirmar o fim.`
    );
    return;
  }

  throw new Error(
    `A impressora ${host} recebeu o pedido mas não começou a imprimir em ${JOB_WAIT_MS / 1000}s — ${motivoLegivel(ultimaRazao)}.`
  );
}

/**
 * Um ENVIO por vez em cada impressora — as HP da loja atendem uma conexão
 * IPP por vez.
 */
const filaPorImpressora = new Map<string, Promise<unknown>>();

function enfileirarPorImpressora<T>(host: string, tarefa: () => Promise<T>): Promise<T> {
  const anterior = filaPorImpressora.get(host) ?? Promise.resolve();
  const atual = anterior.then(tarefa, tarefa);
  filaPorImpressora.set(
    host,
    atual.catch(() => {})
  );
  return atual;
}

/**
 * Imprime UMA folha em UMA impressora, e só resolve quando ela confirma que
 * o job terminou.
 */
export async function printOrderSheet(pdf: Buffer, host: string): Promise<void> {
  const ps = await pdfToPostScript(pdf);

  const inicio = Date.now();

  const res = await enfileirarPorImpressora(host, () =>
    ippExecute(host, "Print-Job", {
      "operation-attributes-tag": {
        "requesting-user-name": "portaria",
        "job-name": "lista-separacao-portaria",
        "document-format": "application/postscript",
      },
      "job-attributes-tag": { copies: COPIES },
      data: ps,
    })
  );

  if (res.statusCode !== "successful-ok") {
    throw new Error(`Impressora ${host} recusou a impressão (${res.statusCode}).`);
  }

  const jobId = res["job-attributes-tag"]?.["job-id"];
  if (typeof jobId !== "number") {
    console.warn(`[print] ${host}: aceitou sem devolver job-id — não deu para confirmar a saída.`);
    return;
  }

  await aguardarJob(host, jobId);
  console.log(`[print] ${host}: job ${jobId} concluído em ${((Date.now() - inicio) / 1000).toFixed(1)}s.`);
}
