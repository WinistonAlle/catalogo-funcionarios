// scripts/gerar-employee-prices.mjs
import xlsx from "xlsx";
import fs from "fs";

// Caminho do arquivo que você me enviou
const workbook = xlsx.readFile("Tabela de funcionarios.xlsx");
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet);

// Vamos assumir as colunas do arquivo exatamente assim:
// - "Cod"
// - "Desc"
// - "FUNCIONARIOS/PARCEIRO DF"

const lines = [];

for (const row of rows) {
  const cod = String(row["Cod"]).trim();
  const priceRaw = row["FUNCIONARIOS/PARCEIRO DF"];

  if (!cod || priceRaw == null || priceRaw === "") continue;

  const price = Number(priceRaw);

  if (Number.isNaN(price)) continue;

  const desc = String(row["Desc"] ?? "").trim();
  lines.push(`  "${cod}": ${price.toFixed(2)}, // ${desc}`);
}

const output =
  "export const EMPLOYEE_PRICES: Record<string, number> = {\n" +
  lines.join("\n") +
  "\n};\n";

// Gera a pasta automaticamente, caso não exista
fs.mkdirSync("src/config", { recursive: true });

// Cria arquivo final com os preços
fs.writeFileSync("src/config/employee-prices.ts", output, "utf8");

console.log("✅ Arquivo src/config/employee-prices.ts gerado com sucesso!");
