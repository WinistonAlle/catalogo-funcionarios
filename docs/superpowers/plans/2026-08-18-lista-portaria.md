# Lista de Separação na Portaria — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Imprimir, uma vez por dia útil às 13:40, uma folha por pedido de funcionário pago e ainda não impresso, na impressora da portaria — sem mudar quando o pedido entra no CIGAM (isso continua imediato, como hoje).

**Architecture:** Uma rotina nova (`automation/print/portariaList.ts`) roda dentro do `webhook` já existente (`automation/operations-webhook.ts`), no mesmo padrão do auto-sync de pedidos/estoque: intervalo curto, guarda contra sobreposição, sem estado externo de "já rodou hoje". O truque que evita precisar desse estado: cada pedido só entra na lista se `created_at` for anterior ao instante de "hoje às 13:40" — então pedido feito depois do corte simplesmente não é alcançado até o corte do dia seguinte, e reexecuções no mesmo dia (retry de falha de impressão) continuam pegando exatamente o mesmo conjunto, sem duplicar nem vazar pedido novo pra lista de hoje.

**Tech Stack:** `pdfkit` (gera o PDF, uma página por pedido), `ipp` + `cupsfilter`/`pdftops` (envia pra impressora, convertendo pra PostScript — porta o módulo já validado ao vivo em `pdv-gostinho-mineiro`), Supabase (coluna nova `orders.printed_at`), vitest.

---

## Contexto que todo task assume

- Repo: `/Users/winistonalle/Desktop/projetos/gostinho mineiro/catalogo-funcionarios`
- Spec aprovada: `docs/superpowers/specs/2026-08-18-lista-portaria-design.md`
- Rodar `npm test` = `vitest run`. Cobre `src/**/*.test.ts` e `automation/**/*.test.ts` (`vite.config.ts`) — os testes novos entram nesse cobertura sem mexer em config.
- `automation/` **não** tem `tsconfig.json` próprio. O jeito de checar tipo é o comando manual documentado no `CLAUDE.md` (Task 8 atualiza esse comando para incluir os arquivos novos).
- As impressoras (`192.168.100.53` produção, `192.168.100.142` teste) só são alcançáveis da rede da loja — que é a mesma rede do servidor de produção deste projeto (`~/projetos/pdv-gostinho-mineiro/docs/deploy-servidor-linux.md`: "O servidor fica na mesma rede da loja"). **A máquina de desenvolvimento (este Mac) não alcança nenhuma das duas.** Por isso todo teste com impressora de verdade (Task 10) só roda no servidor — as Tasks 1–9 são só código + testes com mock, verificáveis localmente.
- Projeto irmão de referência: `~/projetos/pdv-gostinho-mineiro/server/src/print/` — já resolveu ao vivo as armadilhas de impressão (documentadas nos comentários do código, preservadas nesta cópia).

---

### Task 1: Coluna `printed_at` em `orders`

**Files:**
- Create: `scripts/2026-08-18-lista-portaria-printed-at.sql`

- [ ] **Step 1: Escrever o script SQL**

```sql
-- =====================================================================
-- 18/08/2026 — Coluna para a lista de separação impressa na portaria
-- =====================================================================
--
-- NULL = pedido ainda não impresso. A rotina automation/print/portariaList.ts
-- marca a hora real só depois de a impressora confirmar que o job terminou
-- (nunca antes) — ver aguardarJob em automation/print/printClient.ts.
--
-- Spec: docs/superpowers/specs/2026-08-18-lista-portaria-design.md

alter table public.orders
  add column if not exists printed_at timestamptz;
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/winistonalle/Desktop/projetos/gostinho mineiro/catalogo-funcionarios"
git add scripts/2026-08-18-lista-portaria-printed-at.sql
git commit -m "Adicionar script da coluna orders.printed_at (lista da portaria)"
```

Este script **não roda daqui** — vai ao Postgres do servidor (`127.0.0.1:54322`), via `psql`, seguindo o mesmo fluxo dos outros scripts em `scripts/`. Fica marcado como pendência para quando o Winiston fizer o deploy (Task 10 cobre isso).

---

### Task 2: `automation/holidays.ts` — dia útil em São Paulo

**Files:**
- Create: `automation/holidays.ts`
- Test: `automation/holidays.test.ts`

- [ ] **Step 1: Escrever o teste (vai falhar — o módulo não existe ainda)**

```typescript
// automation/holidays.test.ts
import { describe, expect, it } from "vitest";
import { FERIADOS_LOCAIS, feriadosNacionais, isBusinessDayInSaoPaulo } from "./holidays";

/**
 * Confere o algoritmo de Gauss contra fato público: Páscoa 2025 = 20/04,
 * 2026 = 05/04. As duas batem — dá confiança de que a fórmula está certa,
 * não só "compilou".
 */
describe("feriadosNacionais", () => {
  it("2026: datas fixas mais as que derivam da Páscoa (5 de abril)", () => {
    const feriados = feriadosNacionais(2026);

    expect(feriados.has("2026-01-01")).toBe(true); // Confraternização
    expect(feriados.has("2026-04-21")).toBe(true); // Tiradentes
    expect(feriados.has("2026-05-01")).toBe(true); // Trabalho
    expect(feriados.has("2026-09-07")).toBe(true); // Independência
    expect(feriados.has("2026-10-12")).toBe(true); // Aparecida
    expect(feriados.has("2026-11-02")).toBe(true); // Finados
    expect(feriados.has("2026-11-15")).toBe(true); // República
    expect(feriados.has("2026-12-25")).toBe(true); // Natal

    expect(feriados.has("2026-02-17")).toBe(true); // Carnaval (terça)
    expect(feriados.has("2026-04-03")).toBe(true); // Sexta-feira Santa
    expect(feriados.has("2026-06-04")).toBe(true); // Corpus Christi

    expect(feriados.size).toBe(11);
  });

  it("2027 recalcula sozinho, sem tabela — a Páscoa muda de data", () => {
    const feriados = feriadosNacionais(2027);
    expect(feriados.has("2026-04-03")).toBe(false);
    expect(feriados.has("2026-06-04")).toBe(false);
    expect(feriados.size).toBe(11);
  });
});

describe("isBusinessDayInSaoPaulo", () => {
  it("uma terça-feira comum é dia útil", () => {
    expect(isBusinessDayInSaoPaulo(new Date("2026-08-18T12:00:00-03:00"))).toBe(true);
  });

  it("sábado e domingo não são dia útil", () => {
    expect(isBusinessDayInSaoPaulo(new Date("2026-08-22T12:00:00-03:00"))).toBe(false); // sábado
    expect(isBusinessDayInSaoPaulo(new Date("2026-08-23T12:00:00-03:00"))).toBe(false); // domingo
  });

  it("feriado nacional fixo não é dia útil", () => {
    expect(isBusinessDayInSaoPaulo(new Date("2026-12-25T12:00:00-03:00"))).toBe(false); // Natal
  });

  it("feriado móvel (derivado da Páscoa) não é dia útil", () => {
    expect(isBusinessDayInSaoPaulo(new Date("2026-06-04T12:00:00-03:00"))).toBe(false); // Corpus Christi
  });

  it("feriado local cadastrado em FERIADOS_LOCAIS não é dia útil", () => {
    FERIADOS_LOCAIS.add("2026-09-20"); // data fictícia, só para o teste
    expect(isBusinessDayInSaoPaulo(new Date("2026-09-20T12:00:00-03:00"))).toBe(false);
    FERIADOS_LOCAIS.delete("2026-09-20");
  });

  it("usa o fuso de São Paulo, não o UTC do timestamp", () => {
    // 24/08 01:00 UTC ainda é 23/08 22:00 em São Paulo (UTC-3) — domingo lá,
    // mesmo já sendo segunda em UTC.
    expect(isBusinessDayInSaoPaulo(new Date("2026-08-24T01:00:00Z"))).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste, conferir que falha por módulo ausente**

Run: `npx vitest run automation/holidays.test.ts`
Expected: FAIL — `Cannot find module './holidays'` (ou equivalente).

- [ ] **Step 3: Implementar `automation/holidays.ts`**

```typescript
/**
 * Dia útil no fuso de São Paulo, para a lista de separação impressa às 13:40
 * (ver automation/print/portariaList.ts). Sábado e domingo são sempre
 * pulados; feriado nacional é CALCULADO, não cadastrado — datas fixas mais as
 * que derivam da Páscoa pelo algoritmo de Gauss, correto para qualquer ano
 * sem manutenção. Só os feriados locais (municipal de Ituiutaba, ponto
 * facultativo, recesso) exigem atualização manual, em FERIADOS_LOCAIS logo
 * abaixo — uma vez por ano.
 *
 * Um feriado local esquecido não é grave: a rotina de impressão simplesmente
 * não roda naquele dia (ninguém estaria lá para receber o papel), e os
 * pedidos entram na lista do próximo dia útil sozinhos.
 */
const TIMEZONE = "America/Sao_Paulo";

/** "YYYY-MM-DD". Atualizar uma vez por ano — ver CLAUDE.md, "Lista da portaria". */
export const FERIADOS_LOCAIS = new Set<string>([]);

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Domingo de Páscoa pelo algoritmo de Gauss (anonymous Gregorian algorithm).
 * Correto para qualquer ano do calendário gregoriano. Conferido contra dois
 * anos de fato público: 2025 = 20/04, 2026 = 05/04 (ver holidays.test.ts).
 */
function pascoa(ano: number): { mes: number; dia: number } {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return { mes, dia };
}

function somarDias(ano: number, mes: number, dia: number, deslocamento: number): string {
  // Meio-dia UTC evita o dia mudar por causa de fuso na hora de somar.
  const data = new Date(Date.UTC(ano, mes - 1, dia, 12));
  data.setUTCDate(data.getUTCDate() + deslocamento);
  return `${data.getUTCFullYear()}-${pad(data.getUTCMonth() + 1)}-${pad(data.getUTCDate())}`;
}

/** Feriados nacionais do ano, como chaves "YYYY-MM-DD". */
export function feriadosNacionais(ano: number): Set<string> {
  const p = pascoa(ano);
  return new Set<string>([
    `${ano}-01-01`, // Confraternização Universal
    somarDias(ano, p.mes, p.dia, -47), // Carnaval (terça)
    somarDias(ano, p.mes, p.dia, -2), // Sexta-feira Santa
    `${ano}-04-21`, // Tiradentes
    `${ano}-05-01`, // Dia do Trabalho
    somarDias(ano, p.mes, p.dia, 60), // Corpus Christi
    `${ano}-09-07`, // Independência
    `${ano}-10-12`, // Nossa Senhora Aparecida
    `${ano}-11-02`, // Finados
    `${ano}-11-15`, // Proclamação da República
    `${ano}-12-25`, // Natal
  ]);
}

function chaveSaoPaulo(data: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(data);
  const ano = partes.find((p) => p.type === "year")?.value ?? "1970";
  const mes = partes.find((p) => p.type === "month")?.value ?? "01";
  const dia = partes.find((p) => p.type === "day")?.value ?? "01";
  return `${ano}-${mes}-${dia}`;
}

function diaDaSemanaSaoPaulo(data: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, weekday: "short" }).format(data);
}

/**
 * true se `data` cai num dia útil em São Paulo: não é sábado/domingo, não é
 * feriado nacional (calculado) nem local (FERIADOS_LOCAIS).
 */
export function isBusinessDayInSaoPaulo(data: Date = new Date()): boolean {
  const diaSemana = diaDaSemanaSaoPaulo(data);
  if (diaSemana === "Sat" || diaSemana === "Sun") return false;

  const chave = chaveSaoPaulo(data);
  const ano = Number(chave.slice(0, 4));
  if (feriadosNacionais(ano).has(chave)) return false;
  if (FERIADOS_LOCAIS.has(chave)) return false;

  return true;
}
```

- [ ] **Step 4: Rodar o teste, conferir que passa**

Run: `npx vitest run automation/holidays.test.ts`
Expected: PASS — 9 testes.

- [ ] **Step 5: Commit**

```bash
git add automation/holidays.ts automation/holidays.test.ts
git commit -m "Adicionar cálculo de dia útil em São Paulo (feriados nacionais + locais)"
```

---

### Task 3: `automation/print/cutoff.ts` — horário de corte (13:40)

**Files:**
- Create: `automation/print/cutoff.ts`
- Test: `automation/print/cutoff.test.ts`

- [ ] **Step 1: Escrever o teste**

```typescript
// automation/print/cutoff.test.ts
import { describe, expect, it } from "vitest";
import { cutoffInstantForToday, isAfterCutoffInSaoPaulo } from "./cutoff";

describe("isAfterCutoffInSaoPaulo", () => {
  it("13:39 ainda não passou do corte", () => {
    expect(isAfterCutoffInSaoPaulo(new Date("2026-08-18T13:39:00-03:00"))).toBe(false);
  });

  it("13:40 em ponto já conta como passado do corte", () => {
    expect(isAfterCutoffInSaoPaulo(new Date("2026-08-18T13:40:00-03:00"))).toBe(true);
  });

  it("qualquer hora depois de 13:40 também conta", () => {
    expect(isAfterCutoffInSaoPaulo(new Date("2026-08-18T18:00:00-03:00"))).toBe(true);
  });

  it("usa o fuso de São Paulo: 16:35 UTC é 13:35 em SP, ainda antes do corte", () => {
    expect(isAfterCutoffInSaoPaulo(new Date("2026-08-18T16:35:00Z"))).toBe(false);
  });
});

describe("cutoffInstantForToday", () => {
  it("monta o instante de hoje às 13:40 em São Paulo", () => {
    const agora = new Date("2026-08-18T20:00:00-03:00");
    const corte = cutoffInstantForToday(agora);
    expect(corte.toISOString()).toBe("2026-08-18T16:40:00.000Z"); // 13:40 -03:00 = 16:40 UTC
  });

  it("um pedido feito antes do corte fica antes do instante calculado", () => {
    const agora = new Date("2026-08-18T20:00:00-03:00");
    const pedidoDasNove = new Date("2026-08-18T09:00:00-03:00");
    expect(pedidoDasNove.getTime()).toBeLessThan(cutoffInstantForToday(agora).getTime());
  });

  it("um pedido feito depois do corte fica depois do instante calculado", () => {
    const agora = new Date("2026-08-18T20:00:00-03:00");
    const pedidoDasQuinze = new Date("2026-08-18T15:00:00-03:00");
    expect(pedidoDasQuinze.getTime()).toBeGreaterThan(cutoffInstantForToday(agora).getTime());
  });
});
```

- [ ] **Step 2: Rodar o teste, conferir que falha por módulo ausente**

Run: `npx vitest run automation/print/cutoff.test.ts`
Expected: FAIL — `Cannot find module './cutoff'`.

- [ ] **Step 3: Implementar `automation/print/cutoff.ts`**

```typescript
/**
 * Horário de corte da câmara fria: 13:40, fuso América/São_Paulo. Mesma regra
 * que a tela do Checkout mostra ao funcionário (`isAfterSeparationCutoff`,
 * src/pages/Checkout.tsx) — duplicada aqui porque automation/ roda em Node
 * (tsx) e não importa de src/ (bundle de navegador). Se o horário mudar,
 * mudar nos dois lugares.
 */
const TIMEZONE = "America/Sao_Paulo";
const CUTOFF_HOUR = 13;
const CUTOFF_MINUTE = 40;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function isAfterCutoffInSaoPaulo(agora: Date = new Date()): boolean {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(agora);
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
  const minuto = Number(partes.find((p) => p.type === "minute")?.value ?? "0");
  return hora * 60 + minuto >= CUTOFF_HOUR * 60 + CUTOFF_MINUTE;
}

/**
 * O instante exato de "hoje às 13:40" em São Paulo, como Date — usado para
 * filtrar quais pedidos entram na lista de hoje (`created_at` antes deste
 * instante) sem precisar de flag de "já rodou hoje": pedido feito depois
 * deste instante simplesmente não é alcançado pelo filtro, e some para a
 * lista do próximo dia útil sozinho.
 *
 * São Paulo não observa horário de verão desde 2019 — UTC-3 é fixo, então dá
 * para montar a string ISO direto, sem lib de fuso horário.
 */
export function cutoffInstantForToday(agora: Date = new Date()): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const ano = partes.find((p) => p.type === "year")?.value;
  const mes = partes.find((p) => p.type === "month")?.value;
  const dia = partes.find((p) => p.type === "day")?.value;
  return new Date(`${ano}-${mes}-${dia}T${pad(CUTOFF_HOUR)}:${pad(CUTOFF_MINUTE)}:00-03:00`);
}
```

- [ ] **Step 4: Rodar o teste, conferir que passa**

Run: `npx vitest run automation/print/cutoff.test.ts`
Expected: PASS — 7 testes.

- [ ] **Step 5: Commit**

```bash
git add automation/print/cutoff.ts automation/print/cutoff.test.ts
git commit -m "Adicionar cálculo do horário de corte da câmara fria (13:40, fuso SP)"
```

---

### Task 4: `automation/print/pdfBuilder.ts` — a folha do pedido

**Files:**
- Modify: `package.json` (dependência `pdfkit`)
- Create: `automation/print/pdfBuilder.ts`
- Test: `automation/print/pdfBuilder.test.ts`

- [ ] **Step 1: Adicionar `pdfkit` ao `package.json`**

Em `dependencies` (ordem alfabética), depois de `"next-themes": "^0.3.0",`:

```json
    "next-themes": "^0.3.0",
    "pdfkit": "^0.15.0",
    "react": "^18.3.1",
```

Em `devDependencies`, depois de `"@types/node": "^22.5.5",`:

```json
    "@types/node": "^22.5.5",
    "@types/pdfkit": "^0.13.4",
    "@types/react": "^18.3.3",
```

- [ ] **Step 2: Instalar**

Run: `npm install`
Expected: instala sem erro; `package-lock.json` é atualizado (o `npm ci` deste repo já está quebrado por um lockfile antigo desatualizado — ver `CLAUDE.md` — `npm install` é o comando certo aqui e no deploy).

- [ ] **Step 3: Escrever o teste (vai falhar — o módulo não existe ainda)**

```typescript
// automation/print/pdfBuilder.test.ts
import { describe, expect, it } from "vitest";
import { buildOrderSheetPdf } from "./pdfBuilder";

describe("buildOrderSheetPdf", () => {
  it("produz um PDF não vazio, com a assinatura %PDF", async () => {
    const buffer = await buildOrderSheetPdf({
      orderNumber: "GM-20260818-0001",
      employeeName: "MARCELO SILVA",
      items: [
        { productName: "Pão de Queijo 1kg", quantity: 1 },
        { productName: "Coxinha", quantity: 2 },
      ],
    });

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("não quebra com lista de itens vazia", async () => {
    const buffer = await buildOrderSheetPdf({
      orderNumber: "GM-TEST",
      employeeName: "TESTE",
      items: [],
    });

    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("lida com nome de funcionário e produto com acento sem lançar erro", async () => {
    const buffer = await buildOrderSheetPdf({
      orderNumber: "GM-ACENTO",
      employeeName: "JOÃO CONCEIÇÃO",
      items: [{ productName: "Pão de Queijo Ímpar 30G – Pacote 5Kg", quantity: 3 }],
    });

    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });
});
```

- [ ] **Step 4: Rodar o teste, conferir que falha por módulo ausente**

Run: `npx vitest run automation/print/pdfBuilder.test.ts`
Expected: FAIL — `Cannot find module './pdfBuilder'`.

- [ ] **Step 5: Implementar `automation/print/pdfBuilder.ts`**

```typescript
import PDFDocument from "pdfkit";

export interface OrderSheetItem {
  productName: string;
  quantity: number;
}

export interface OrderSheetData {
  orderNumber: string;
  employeeName: string;
  items: OrderSheetItem[];
}

const qtyFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/**
 * Uma folha A4 por pedido — separada de propósito, porque a câmara fria
 * grampeia cada uma antes de separar. Simples: nome do funcionário e o que
 * ele pediu. Sem preço nem dado fiscal — isso já está no CIGAM; esta folha é
 * só para a separação física do produto.
 */
export function buildOrderSheetPdf(pedido: OrderSheetData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(18).text("Separação — Pedido de Funcionário");
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(11).fillColor("#555555").text(`Pedido ${pedido.orderNumber}`);
    doc.moveDown(1);

    doc.font("Helvetica-Bold").fontSize(16).fillColor("#000000").text(pedido.employeeName);
    doc.moveDown(0.8);

    doc.font("Helvetica").fontSize(13).fillColor("#000000");
    if (pedido.items.length === 0) {
      doc.text("(pedido sem itens)");
    }
    for (const item of pedido.items) {
      doc.text(`• ${qtyFormatter.format(item.quantity)}x  ${item.productName}`);
      doc.moveDown(0.3);
    }

    doc.end();
  });
}
```

- [ ] **Step 6: Rodar o teste, conferir que passa**

Run: `npx vitest run automation/print/pdfBuilder.test.ts`
Expected: PASS — 3 testes.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json automation/print/pdfBuilder.ts automation/print/pdfBuilder.test.ts
git commit -m "Gerar a folha de separação (uma página por pedido) com pdfkit"
```

---

### Task 5: `automation/print/printClient.ts` — envio para a impressora via IPP

Porta o módulo já validado ao vivo em `pdv-gostinho-mineiro/server/src/print/printClient.ts`
(armadilhas resolvidas: PDF puro é rejeitado, PostScript sem `media=A4` "completa" sem sair
folha, `successful-ok` do `Print-Job` não significa que saiu papel — só `Get-Job-Attributes`
confirma). Muda: 1 via por folha (não 2), `job-name` novo.

**Files:**
- Modify: `package.json` (dependência `ipp`)
- Create: `automation/types/ipp.d.ts`
- Create: `automation/print/printClient.ts`
- Test: `automation/print/printClient.test.ts`

- [ ] **Step 1: Adicionar `ipp` ao `package.json`**

Em `dependencies`, depois de `"googleapis": "^167.0.0",`:

```json
    "googleapis": "^167.0.0",
    "ipp": "^2.0.1",
    "jspdf": "^3.0.4",
```

- [ ] **Step 2: Instalar**

Run: `npm install`
Expected: instala sem erro.

- [ ] **Step 3: Criar a declaração de tipo (a lib `ipp` não vem com uma)**

```typescript
// automation/types/ipp.d.ts
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
```

- [ ] **Step 4: Escrever o teste (vai falhar — o módulo não existe ainda)**

```typescript
// automation/print/printClient.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: (
    _cmd: string,
    _args: string[],
    _opts: unknown,
    cb: (err: Error | null, result: { stdout: Buffer; stderr: Buffer }) => void
  ) => cb(null, { stdout: Buffer.from("%!PS-Adobe-3.0\nfake postscript"), stderr: Buffer.from("") }),
}));

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("ipp", () => {
  const execute = vi.fn((_op, _msg, cb) => cb(null, { statusCode: "successful-ok" }));
  return {
    default: {
      Printer: vi.fn().mockImplementation(() => ({ execute })),
    },
  };
});

describe("printOrderSheet", () => {
  it("converte o PDF para PostScript (cupsfilter) antes de mandar, com 1 via", async () => {
    const { printOrderSheet } = await import("./printClient.js");
    const ipp = (await import("ipp")).default as unknown as { Printer: ReturnType<typeof vi.fn> };
    const buffer = Buffer.from("%PDF-fake");

    await printOrderSheet(buffer, "10.0.0.10");

    expect(ipp.Printer).toHaveBeenCalledWith("http://10.0.0.10:631/ipp/print");

    const execute = ipp.Printer.mock.results[0].value.execute as ReturnType<typeof vi.fn>;
    const [, message] = execute.mock.calls[0];
    expect(message["operation-attributes-tag"]["document-format"]).toBe("application/postscript");
    expect(message["job-attributes-tag"].copies).toBe(1);
    expect(message.data.toString().startsWith("%!PS-Adobe-3.0")).toBe(true);
  });

  it("falha com erro legível quando a impressora recusa a conexão", async () => {
    vi.resetModules();
    vi.doMock("ipp", () => {
      const err = new Error("connect ECONNREFUSED") as NodeJS.ErrnoException;
      err.code = "ECONNREFUSED";
      const execute = vi.fn((_op: string, _msg: unknown, cb: (e: Error) => void) => cb(err));
      return { default: { Printer: vi.fn().mockImplementation(() => ({ execute })) } };
    });
    vi.doMock("node:child_process", () => ({
      execFile: (_c: string, _a: string[], _o: unknown, cb: (e: null, r: { stdout: Buffer }) => void) =>
        cb(null, { stdout: Buffer.from("%!PS-Adobe-3.0\nok") }),
    }));
    vi.doMock("node:fs/promises", () => ({
      writeFile: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
    }));

    const { printOrderSheet } = await import("./printClient.js");
    await expect(printOrderSheet(Buffer.from("%PDF"), "10.0.0.10")).rejects.toThrow(/recusou a conexão/);
  });
});

/**
 * O núcleo da correção original (2026-08-14, no PDV): "a impressora aceitou"
 * não é "saiu papel". `Print-Job` volta `successful-ok` mesmo com o job
 * ainda `pending` — só `Get-Job-Attributes` confirma o que aconteceu de
 * verdade.
 */
describe("printOrderSheet: confirmação do que REALMENTE saiu", () => {
  function mockImpressora(estados: Array<{ "job-state": string; "job-state-reasons"?: string }>) {
    const enviados: Buffer[] = [];
    let i = 0;
    const execute = vi.fn((op: string, msg: Record<string, unknown>, cb: (e: Error | null, r: unknown) => void) => {
      if (op === "Print-Job") {
        enviados.push(msg.data as Buffer);
        setTimeout(
          () =>
            cb(null, {
              statusCode: "successful-ok",
              "job-attributes-tag": { "job-id": 77, "job-state": "pending" },
            }),
          100
        );
        return;
      }
      const estado = estados[Math.min(i++, estados.length - 1)];
      cb(null, { statusCode: "successful-ok", "job-attributes-tag": estado });
    });
    vi.doMock("ipp", () => ({ default: { Printer: vi.fn().mockImplementation(() => ({ execute })) } }));
    vi.doMock("node:child_process", () => ({
      execFile: (_c: string, _a: string[], _o: unknown, cb: (e: null, r: { stdout: Buffer }) => void) =>
        cb(null, { stdout: Buffer.from("%!PS-Adobe-3.0\nok") }),
    }));
    vi.doMock("node:fs/promises", () => ({
      writeFile: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
    }));
    return { execute, enviados };
  }

  it("só resolve depois de a impressora confirmar o job como concluído", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const { execute } = mockImpressora([{ "job-state": "processing" }, { "job-state": "completed" }]);
    const { printOrderSheet } = await import("./printClient.js");

    let terminou = false;
    const p = printOrderSheet(Buffer.from("%PDF"), "10.0.0.10").then(() => {
      terminou = true;
    });

    await vi.advanceTimersByTimeAsync(1200);
    expect(terminou).toBe(false);

    await vi.advanceTimersByTimeAsync(1200);
    await p;
    expect(terminou).toBe(true);
    expect(execute.mock.calls.map((c) => c[0])).toEqual(["Print-Job", "Get-Job-Attributes", "Get-Job-Attributes"]);
    vi.useRealTimers();
  });

  it("falha com o motivo em português quando a impressora aborta o job", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    mockImpressora([{ "job-state": "aborted", "job-state-reasons": "media-empty" }]);
    const { printOrderSheet } = await import("./printClient.js");

    const p = printOrderSheet(Buffer.from("%PDF"), "10.0.0.10");
    const esperado = expect(p).rejects.toThrow(/sem papel/);
    await vi.advanceTimersByTimeAsync(1500);
    await esperado;
    vi.useRealTimers();
  });

  it("falha quando o job fica preso em pending sem começar, dizendo o que conferir", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    mockImpressora([{ "job-state": "pending", "job-state-reasons": "media-empty" }]);
    const { printOrderSheet } = await import("./printClient.js");

    const p = printOrderSheet(Buffer.from("%PDF"), "10.0.0.10");
    const esperado = expect(p).rejects.toThrow(/não começou a imprimir em 60s.*sem papel/s);
    await vi.advanceTimersByTimeAsync(70_000);
    await esperado;
    vi.useRealTimers();
  });

  it("NÃO acusa falha num job lento que já está imprimindo", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    mockImpressora([{ "job-state": "processing", "job-state-reasons": "resources-are-not-ready" }]);
    const { printOrderSheet } = await import("./printClient.js");

    const p = printOrderSheet(Buffer.from("%PDF"), "10.0.0.10");
    await vi.advanceTimersByTimeAsync(70_000);
    await expect(p).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it("não manda para a impressora um conversor que saiu sem erro mas sem PostScript", async () => {
    vi.resetModules();
    const execute = vi.fn();
    vi.doMock("ipp", () => ({ default: { Printer: vi.fn().mockImplementation(() => ({ execute })) } }));
    vi.doMock("node:child_process", () => ({
      execFile: (_c: string, _a: string[], _o: unknown, cb: (e: null, r: { stdout: Buffer }) => void) =>
        cb(null, { stdout: Buffer.alloc(0) }),
    }));
    vi.doMock("node:fs/promises", () => ({
      writeFile: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
    }));
    const { printOrderSheet } = await import("./printClient.js");

    await expect(printOrderSheet(Buffer.from("%PDF"), "10.0.0.10")).rejects.toThrow(/não produziu PostScript/);
    expect(execute).not.toHaveBeenCalled();
  });

  it("enfileira envios para a MESMA impressora, sem sobrepor conexões", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const { execute } = mockImpressora([{ "job-state": "completed" }]);
    const { printOrderSheet } = await import("./printClient.js");

    const a = printOrderSheet(Buffer.from("%PDF"), "10.0.0.10");
    const b = printOrderSheet(Buffer.from("%PDF"), "10.0.0.10");

    await vi.advanceTimersByTimeAsync(0);
    expect(execute.mock.calls.filter((c) => c[0] === "Print-Job")).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(5000);
    await Promise.all([a, b]);
    expect(execute.mock.calls.filter((c) => c[0] === "Print-Job")).toHaveLength(2);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 5: Rodar o teste, conferir que falha por módulo ausente**

Run: `npx vitest run automation/print/printClient.test.ts`
Expected: FAIL — `Cannot find module './printClient.js'`.

- [ ] **Step 6: Implementar `automation/print/printClient.ts`**

```typescript
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
```

- [ ] **Step 7: Rodar o teste, conferir que passa**

Run: `npx vitest run automation/print/printClient.test.ts`
Expected: PASS — 8 testes.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json automation/types/ipp.d.ts automation/print/printClient.ts automation/print/printClient.test.ts
git commit -m "Portar o envio IPP para impressora (do pdv-gostinho-mineiro), 1 via por folha"
```

---

### Task 6: `automation/print/portariaList.ts` — orquestrador

Junta tudo: dia útil (Task 2), corte (Task 3), busca no Supabase, gera a folha
(Task 4) e imprime (Task 5), marcando `printed_at` só no que confirmadamente
saiu.

**Sem teste de unidade para este arquivo** — segue a convenção já usada em
`automation/cigam/process-pending-orders.ts`, que também não testa a função
que toca o Supabase diretamente (`processPendingOrders`), só a lógica pura que
ela chama (`buildItens`, `efetivacaoConcluiu`). Aqui a lógica pura já saiu para
`holidays.ts` e `cutoff.ts`, e já está coberta. Este arquivo é fino o
suficiente (busca + laço + chamada) para não precisar de mock de Supabase — a
verificação real acontece contra o Postgres de verdade, no servidor (Task 10).

**Files:**
- Create: `automation/print/portariaList.ts`

- [ ] **Step 1: Implementar**

```typescript
import { SupabaseClient } from "@supabase/supabase-js";
import { isBusinessDayInSaoPaulo } from "../holidays";
import { cutoffInstantForToday, isAfterCutoffInSaoPaulo } from "./cutoff";
import { buildOrderSheetPdf } from "./pdfBuilder";
import { printOrderSheet } from "./printClient";

type ItemRow = {
  product_name: string;
  quantity: number;
};

type OrderRow = {
  id: string;
  order_number: string;
  employee_name: string | null;
  order_items: ItemRow[];
};

export type PortariaPrintResult = {
  orderId: string;
  orderNumber: string;
  status: "IMPRESSO" | "ERRO";
  error?: string;
};

async function buscarPedidosParaImprimir(
  supabase: SupabaseClient,
  corte: Date,
  limit: number
): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, employee_name, order_items(product_name, quantity)")
    .is("printed_at", null)
    .is("cancelled_at", null)
    .lt("created_at", corte.toISOString())
    // Mesmo critério de "foi pago" que automation/cigam/process-pending-orders.ts —
    // wallet_debited não é escrito de forma confiável (ver comentário lá), então
    // os três sinais juntos são a rede de segurança.
    .or("wallet_debited.eq.true,pay_on_pickup_cents.gt.0,wallet_used_cents.gt.0")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Falha ao buscar pedidos para a lista da portaria: ${error.message}`);
  return (data ?? []) as unknown as OrderRow[];
}

/**
 * Imprime a lista de separação do dia: uma folha por pedido pago e ainda não
 * impresso, criado antes do corte de hoje (13:40). Roda só em dia útil e só
 * depois do corte — chamar fora dessas condições não faz nada (devolve []).
 *
 * Idempotente e retry-safe por construção: o filtro `created_at < corte de
 * hoje` não muda dentro do mesmo dia, então chamar de novo (porque a
 * impressora falhou às 13:40, por exemplo) pega exatamente o mesmo conjunto
 * de pedidos ainda sem `printed_at` — nunca um pedido feito DEPOIS do corte,
 * que só entra no corte de amanhã.
 */
export async function printPortariaList(params: {
  supabase: SupabaseClient;
  printerHost: string;
  now?: Date;
  limit?: number;
}): Promise<PortariaPrintResult[]> {
  const { supabase, printerHost, now = new Date(), limit = 200 } = params;

  if (!isBusinessDayInSaoPaulo(now)) return [];
  if (!isAfterCutoffInSaoPaulo(now)) return [];

  const corte = cutoffInstantForToday(now);
  const pedidos = await buscarPedidosParaImprimir(supabase, corte, limit);

  const resultados: PortariaPrintResult[] = [];

  for (const pedido of pedidos) {
    try {
      const pdf = await buildOrderSheetPdf({
        orderNumber: pedido.order_number,
        employeeName: pedido.employee_name ?? "Funcionário",
        items: pedido.order_items.map((item) => ({
          productName: item.product_name,
          quantity: item.quantity,
        })),
      });

      await printOrderSheet(pdf, printerHost);

      const { error: updateError } = await supabase
        .from("orders")
        .update({ printed_at: new Date().toISOString() })
        .eq("id", pedido.id);
      if (updateError) throw new Error(updateError.message);

      resultados.push({ orderId: pedido.id, orderNumber: pedido.order_number, status: "IMPRESSO" });
    } catch (err: any) {
      // Não marca printed_at: a próxima chamada tenta este pedido de novo.
      resultados.push({
        orderId: pedido.id,
        orderNumber: pedido.order_number,
        status: "ERRO",
        error: err?.message ?? String(err),
      });
    }
  }

  return resultados;
}
```

- [ ] **Step 2: Checar tipos**

Run:
```bash
npx tsc --noEmit --strict --target ES2022 --lib ES2023,DOM --module ESNext \
  --moduleResolution bundler --skipLibCheck --types node \
  automation/print/*.ts automation/holidays.ts automation/types/*.d.ts
```
Expected: sem erro.

- [ ] **Step 3: Commit**

```bash
git add automation/print/portariaList.ts
git commit -m "Adicionar o orquestrador da lista de separação da portaria"
```

---

### Task 7: Ligar no webhook

**Files:**
- Modify: `automation/operations-webhook.ts`

- [ ] **Step 1: Import — logo abaixo do import de `sync-estoque`**

old_string:
```typescript
import { syncEstoque } from "./cigam/sync-estoque";
```

new_string:
```typescript
import { syncEstoque } from "./cigam/sync-estoque";
import { printPortariaList } from "./print/portariaList";
```

- [ ] **Step 2: Disparo automático — logo antes de `app.listen(PORT`**

old_string:
```typescript
async function runCigamAutoSync() {
  if (cigamAutoSyncRunning) return; // evita sobreposição de execuções
  cigamAutoSyncRunning = true;
  try {
    const results = await processPendingOrders({ supabase, limit: 50, dryRun: false });
    if (results.length > 0) {
      const done = results.filter((r) => r.status === "DONE").length;
      const errors = results.filter((r) => r.status === "ERROR");
      console.log(`🧾 CIGAM auto-sync: ${done} enviado(s), ${errors.length} com erro.`);
      for (const e of errors) console.log(`   ⚠️ ${e.orderNumber}: ${e.error}`);
    }
  } catch (err: any) {
    console.error("🧾 CIGAM auto-sync falhou:", err?.message ?? err);
  } finally {
    cigamAutoSyncRunning = false;
  }
}

app.listen(PORT, () => {
```

new_string:
```typescript
async function runCigamAutoSync() {
  if (cigamAutoSyncRunning) return; // evita sobreposição de execuções
  cigamAutoSyncRunning = true;
  try {
    const results = await processPendingOrders({ supabase, limit: 50, dryRun: false });
    if (results.length > 0) {
      const done = results.filter((r) => r.status === "DONE").length;
      const errors = results.filter((r) => r.status === "ERROR");
      console.log(`🧾 CIGAM auto-sync: ${done} enviado(s), ${errors.length} com erro.`);
      for (const e of errors) console.log(`   ⚠️ ${e.orderNumber}: ${e.error}`);
    }
  } catch (err: any) {
    console.error("🧾 CIGAM auto-sync falhou:", err?.message ?? err);
  } finally {
    cigamAutoSyncRunning = false;
  }
}

/**
 * Lista de separação impressa na portaria: uma folha por pedido pago e ainda
 * não impresso, uma vez por dia útil às 13:40 (o resto das checagens no
 * mesmo dia não fazem nada além de retentar o que falhou — ver
 * print/portariaList.ts). Desligado por padrão — só liga com
 * PORTARIA_PRINTER_HOST e PORTARIA_PRINT_INTERVAL_MS > 0 configurados.
 */
const PORTARIA_PRINTER_HOST = process.env.PORTARIA_PRINTER_HOST;
const PORTARIA_PRINT_INTERVAL_MS = Number(process.env.PORTARIA_PRINT_INTERVAL_MS ?? 0);
let portariaPrintRunning = false;

async function runPortariaPrint() {
  if (portariaPrintRunning) return; // evita sobreposição de execuções
  if (!PORTARIA_PRINTER_HOST) return;
  portariaPrintRunning = true;
  try {
    const resultados = await printPortariaList({ supabase, printerHost: PORTARIA_PRINTER_HOST });
    if (resultados.length > 0) {
      const ok = resultados.filter((r) => r.status === "IMPRESSO").length;
      const erros = resultados.filter((r) => r.status === "ERRO");
      console.log(`🖨️ Lista da portaria: ${ok} impresso(s), ${erros.length} com erro.`);
      for (const e of erros) console.log(`   ⚠️ ${e.orderNumber}: ${e.error}`);
    }
  } catch (err: any) {
    console.error("🖨️ Lista da portaria falhou:", err?.message ?? err);
  } finally {
    portariaPrintRunning = false;
  }
}

app.listen(PORT, () => {
```

- [ ] **Step 3: Agendamento — dentro do callback do `app.listen`, depois do bloco de estoque**

old_string:
```typescript
  if (STOCK_SYNC_INTERVAL_MS > 0) {
    const segundos = Math.round(STOCK_SYNC_INTERVAL_MS / 1000);
    console.log(`📦 Estoque sync LIGADO — sincronizando saldo a cada ${segundos}s.`);
    setInterval(runStockSync, STOCK_SYNC_INTERVAL_MS);
    void runStockSync(); // primeira carga logo ao subir
  } else {
    console.log("📦 Estoque sync desligado (defina STOCK_SYNC_INTERVAL_MS para ligar).");
  }
});
```

new_string:
```typescript
  if (STOCK_SYNC_INTERVAL_MS > 0) {
    const segundos = Math.round(STOCK_SYNC_INTERVAL_MS / 1000);
    console.log(`📦 Estoque sync LIGADO — sincronizando saldo a cada ${segundos}s.`);
    setInterval(runStockSync, STOCK_SYNC_INTERVAL_MS);
    void runStockSync(); // primeira carga logo ao subir
  } else {
    console.log("📦 Estoque sync desligado (defina STOCK_SYNC_INTERVAL_MS para ligar).");
  }

  if (PORTARIA_PRINT_INTERVAL_MS > 0 && PORTARIA_PRINTER_HOST) {
    const segundos = Math.round(PORTARIA_PRINT_INTERVAL_MS / 1000);
    console.log(
      `🖨️ Lista da portaria LIGADA — checando a cada ${segundos}s (imprime uma vez por dia útil, às 13:40).`
    );
    setInterval(runPortariaPrint, PORTARIA_PRINT_INTERVAL_MS);
  } else {
    console.log(
      "🖨️ Lista da portaria desligada (defina PORTARIA_PRINTER_HOST e PORTARIA_PRINT_INTERVAL_MS para ligar)."
    );
  }
});
```

- [ ] **Step 4: Checar tipos do webhook inteiro (comando documentado no `CLAUDE.md`, atualizado na Task 8 — rodar já com os arquivos novos)**

Run:
```bash
npx tsc --noEmit --strict --target ES2022 --lib ES2023,DOM --module ESNext \
  --moduleResolution bundler --skipLibCheck --types node \
  automation/cigam/*.ts automation/operations-webhook.ts \
  automation/print/*.ts automation/holidays.ts automation/types/*.d.ts
```
Expected: sem erro.

- [ ] **Step 5: Commit**

```bash
git add automation/operations-webhook.ts
git commit -m "Ligar a lista da portaria no webhook (desligada por padrão)"
```

---

### Task 8: Atualizar `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Atualizar o comando de checagem de tipos (seção "Comandos úteis")**

old_string:
```
```bash
npx tsc --noEmit --strict --target ES2022 --lib ES2023,DOM --module ESNext \
  --moduleResolution bundler --skipLibCheck --types node \
  automation/cigam/*.ts automation/operations-webhook.ts
```

Rodando **fora** do servidor, sobrescrever `SUPABASE_URL` para o domínio público
```

new_string:
```
```bash
npx tsc --noEmit --strict --target ES2022 --lib ES2023,DOM --module ESNext \
  --moduleResolution bundler --skipLibCheck --types node \
  automation/cigam/*.ts automation/operations-webhook.ts \
  automation/print/*.ts automation/holidays.ts automation/types/*.d.ts
```

Rodando **fora** do servidor, sobrescrever `SUPABASE_URL` para o domínio público
```

- [ ] **Step 2: Adicionar seção nova, depois de "## Estoque em tempo real" e antes de "## ⚠️ Preço = preço/kg × peso"**

old_string:
```
## ⚠️ Preço = preço/kg × peso — mexer em `weight` muda o que o funcionário paga
```

new_string:
```
## Lista de separação impressa na portaria (18/08/2026)

A câmara fria só separa pedido de funcionário até as 13:40. Antes disso era só
um aviso na tela do Checkout (`isAfterSeparationCutoff`) — o pedido das 15h
entrava no CIGAM e era efetivado igual ao das 9h, sem nenhum rastro pra quem
separa. Agora, uma vez por dia útil às 13:40, `automation/print/portariaList.ts`
imprime uma folha por pedido pago e ainda não impresso na impressora da
portaria — folhas separadas, porque a câmara fria grampeia cada uma.

**O CIGAM não muda.** Continua entrando em até 2 minutos, como sempre — só a
impressão passa a ser agrupada e no horário certo. Spec completa:
`docs/superpowers/specs/2026-08-18-lista-portaria-design.md`.

### Como funciona sem precisar de "já rodou hoje"

O disparo (`PORTARIA_PRINT_INTERVAL_MS`, mesmo padrão do `CIGAM_AUTO_SYNC_INTERVAL_MS`)
roda de tempos em tempos o dia inteiro, mas só faz algo quando `isBusinessDayInSaoPaulo`
e `isAfterCutoffInSaoPaulo` (`automation/holidays.ts`, `automation/print/cutoff.ts`)
são verdadeiros — e mesmo aí, só imprime pedido com `created_at` **antes** do
instante de hoje às 13:40 (`cutoffInstantForToday`). Pedido feito às 17h não é
alcançado por essa checagem: simplesmente espera o corte de amanhã, sem
lógica extra. E como esse instante não muda dentro do mesmo dia, reexecuções
(porque a impressora falhou às 13:40) pegam exatamente o mesmo conjunto —
idempotente e retry-safe sem precisar de flag de "já rodou".

### Dia útil = calculado, não cadastrado

Feriado nacional é fórmula (datas fixas + as que derivam da Páscoa pelo
algoritmo de Gauss), correta para qualquer ano sem manutenção. Só os locais
(municipal de Ituiutaba, ponto facultativo, recesso) exigem atualização manual,
em `FERIADOS_LOCAIS` (`automation/holidays.ts`) — uma vez por ano. Esquecer um
não é grave: a rotina não roda naquele dia e os pedidos entram na lista do
próximo dia útil sozinhos.

### Impressão: porta o módulo já validado no PDV

`automation/print/printClient.ts` é o mesmo módulo de
`pdv-gostinho-mineiro/server/src/print/printClient.ts` (conversão PDF→PostScript
via `cupsfilter`/`pdftops`, confirmação real de que o job terminou via
`Get-Job-Attributes` — `Print-Job` sozinho só confirma que a impressora
RECEBEU o arquivo). Diferença: 1 via por folha aqui (lá são 2, decisão própria
da loja), `job-name` diferente.

### Env vars (produção, no servidor)

```
PORTARIA_PRINTER_HOST=192.168.100.53       # impressora da portaria
PORTARIA_PRINT_INTERVAL_MS=300000          # 5 min — só dispara de fato às 13:40
```

**Antes de apontar para a portaria de verdade**, validar contra
`192.168.100.142` ("Impressora da Sala", cadastrada como teste no
`printer_settings` do PDV) — só alcançável de dentro da rede da loja, ou seja,
só do servidor, nunca da máquina de desenvolvimento.

## ⚠️ Preço = preço/kg × peso — mexer em `weight` muda o que o funcionário paga
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Documentar a lista de separação da portaria no CLAUDE.md"
```

---

### Task 9: Verificação final local

**Files:** nenhum (só checagem)

- [ ] **Step 1: Suíte de testes inteira**

Run: `npm test`
Expected: todos os testes passam, incluindo os novos (`holidays`, `print/cutoff`,
`print/pdfBuilder`, `print/printClient`) e os que já existiam (45 + os novos —
conferir que nenhum dos antigos quebrou).

- [ ] **Step 2: Checagem de tipos do frontend (baseline conhecido: 144 erros, todos em `src/data/`)**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"`
Expected: `144` — igual ao baseline documentado no `CLAUDE.md`. Se vier
diferente, algo nesta mudança vazou pro frontend (não deveria: nada em
`automation/print/` ou `automation/holidays.ts` é importado por `src/`).

- [ ] **Step 3: Checagem de tipos do `automation/` completo**

Run:
```bash
npx tsc --noEmit --strict --target ES2022 --lib ES2023,DOM --module ESNext \
  --moduleResolution bundler --skipLibCheck --types node \
  automation/cigam/*.ts automation/operations-webhook.ts \
  automation/print/*.ts automation/holidays.ts automation/types/*.d.ts
```
Expected: sem erro.

- [ ] **Step 4: Build do frontend não quebrou**

Run: `npm run build`
Expected: build conclui sem erro (o `automation/` não entra no bundle do
Vite, mas confirma que nada foi quebrado por acidente nos arquivos
compartilhados, como `package.json`).

- [ ] **Step 5: Push**

```bash
git push origin main
```

---

### Task 10: Validação com impressora real — SÓ NO SERVIDOR

**Não executar da máquina de desenvolvimento.** Este projeto roda no
servidor de produção (mesma rede da loja); é de lá que `192.168.100.142` e
`192.168.100.53` são alcançáveis. Ver `CLAUDE.md`, "📍 Trabalhe neste projeto
DIRETO NO SERVIDOR".

- [ ] **Step 1: No servidor — aplicar o SQL da Task 1**

```bash
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f scripts/2026-08-18-lista-portaria-printed-at.sql
```

- [ ] **Step 2: No servidor — atualizar o repo e instalar**

```bash
cd /home/xulio/apps/catalogo-funcionarios
git pull
npm install
```

- [ ] **Step 3: No servidor — configurar `.env` para a IMPRESSORA DE TESTE primeiro**

Adicionar ao `.env`:
```
PORTARIA_PRINTER_HOST=192.168.100.142
PORTARIA_PRINT_INTERVAL_MS=300000
```

- [ ] **Step 4: No servidor — rodar o webhook manualmente em primeiro plano, forçando um pedido de teste antes do corte**

Criar um pedido de teste no banco (ou usar um real de hoje) com `created_at`
antes de agora e `printed_at` null, então:

```bash
cd /home/xulio/apps/catalogo-funcionarios
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
import { printPortariaList } from './automation/print/portariaList';
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
printPortariaList({ supabase, printerHost: '192.168.100.142', now: new Date() })
  .then((r) => console.log(JSON.stringify(r, null, 2)));
"
```

Expected: a folha sai fisicamente na impressora de teste, com nome do
funcionário e itens do pedido. Conferir também que `orders.printed_at` foi
preenchido no banco para o pedido testado.

- [ ] **Step 5: No servidor — testar o caso de falha (impressora desligada)**

Desligar a impressora de teste, rodar o mesmo comando do Step 4 de novo (com
outro pedido, ou resetando `printed_at` do mesmo para null). Confirmar que:
- O resultado volta com `status: "ERRO"` e uma mensagem legível
  ("recusou a conexão" ou similar).
- `orders.printed_at` **continua null** — o pedido não foi marcado como
  impresso.
- Religar a impressora e rodar de novo: a folha sai, sem precisar de nenhuma
  ação manual além de religar o aparelho.

- [ ] **Step 6: Trocar para a impressora de produção e ligar o intervalo**

Só depois do Step 4 e 5 confirmados, no `.env`:
```
PORTARIA_PRINTER_HOST=192.168.100.53
PORTARIA_PRINT_INTERVAL_MS=300000
```

```bash
pm2 restart webhook
pm2 logs webhook --lines 30 --nostream
```

Expected no log: `🖨️ Lista da portaria LIGADA — checando a cada 300s...`.

---

## Fica de fora deste plano (ver spec)

- Painel de acompanhamento das impressões.
- Tela de cadastro de feriados locais (a lista fica em `FERIADOS_LOCAIS`, no código).
- Mudar o momento em que o pedido entra no CIGAM.
- Aviso ao funcionário de "pedido aguardando separação".
