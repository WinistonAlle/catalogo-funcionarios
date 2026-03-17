# Deploy Ubuntu

## Arquitetura recomendada

- `Nginx` serve o frontend estático (`dist/`)
- `systemd` mantém a automação `automation/saibweb-webhook.ts`
- `systemd` mantém um segundo serviço para o sync do Google Sheets
- o webhook Node fica interno em `127.0.0.1:3333`
- o Nginx expõe esse webhook em `/automation/`

## Estrutura sugerida

```text
/var/www/catalogo/
  current/   -> código atual
  shared/
    .env
```

## 1. Dependências do servidor

```bash
sudo apt update
sudo apt install -y nginx curl build-essential
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Se a automação Playwright for rodar nesse Ubuntu:

```bash
npx playwright install --with-deps chromium
```

## 2. Código e build

```bash
sudo mkdir -p /var/www/catalogo
sudo chown -R $USER:$USER /var/www/catalogo
cd /var/www/catalogo
git clone <SEU_REPOSITORIO> current
cd current
npm ci
npm run build
```

Edite `/var/www/catalogo/shared/.env` com as variáveis reais.

Variáveis mínimas novas para automação:

```env
SAIBWEB_WEBHOOK_TOKEN=troque-por-um-token-forte
SAIBWEB_RECOVER_PROCESSING_ON_BOOT=1
SHEET_SYNC_INTERVAL_MS=3600000
SHEET_SYNC_INITIAL_DELAY_MS=5000
```

Variáveis já esperadas pelos serviços:

```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SAIBWEB_URL=...
SAIBWEB_USER=...
SAIBWEB_PASS=...
GOOGLE_SHEETS_SPREADSHEET_ID=...
GOOGLE_SHEETS_RANGE=Funcionarios!A1:Z
GOOGLE_SERVICE_ACCOUNT_JSON=...
```

## 3. systemd

Copie os serviços:

```bash
sudo cp deploy/ubuntu/catalogo-automation.service /etc/systemd/system/catalogo-automation.service
sudo cp deploy/ubuntu/catalogo-sheet-sync.service /etc/systemd/system/catalogo-sheet-sync.service
```

Se necessário, ajuste:

- `User`
- `Group`
- `WorkingDirectory`
- `EnvironmentFile`

Ative:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now catalogo-automation
sudo systemctl enable --now catalogo-sheet-sync
sudo systemctl status catalogo-automation
sudo systemctl status catalogo-sheet-sync
```

Logs:

```bash
journalctl -u catalogo-automation -f
journalctl -u catalogo-sheet-sync -f
```

## 4. Nginx

Copie o template:

```bash
sudo cp deploy/ubuntu/nginx.catalogo.conf /etc/nginx/sites-available/catalogo
sudo ln -s /etc/nginx/sites-available/catalogo /etc/nginx/sites-enabled/catalogo
sudo nginx -t
sudo systemctl reload nginx
```

## 5. Testes

Frontend:

```bash
curl -I http://funcionarios.gostinhomineiro.com
```

Health da automação:

```bash
curl http://127.0.0.1:3333/health \
  -H "Authorization: Bearer $SAIBWEB_WEBHOOK_TOKEN"
curl http://funcionarios.gostinhomineiro.com/automation/health \
  -H "Authorization: Bearer $SAIBWEB_WEBHOOK_TOKEN"
```

Webhook:

```bash
curl -X POST http://funcionarios.gostinhomineiro.com/automation/webhook/new-order \
  -H "Authorization: Bearer $SAIBWEB_WEBHOOK_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"order_id":"test"}'
```

Se o emissor do webhook não conseguir usar `Authorization`, ele pode mandar:

```bash
curl -X POST http://funcionarios.gostinhomineiro.com/automation/webhook/new-order \
  -H "x-webhook-token: $SAIBWEB_WEBHOOK_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"order_id":"test"}'
```

## 6. Aplicando em servidor já existente

```bash
cd /var/www/catalogo/current
git pull
npm ci
npm run build
sudo cp deploy/ubuntu/catalogo-automation.service /etc/systemd/system/catalogo-automation.service
sudo cp deploy/ubuntu/catalogo-sheet-sync.service /etc/systemd/system/catalogo-sheet-sync.service
sudo systemctl daemon-reload
sudo systemctl restart catalogo-automation
sudo systemctl enable --now catalogo-sheet-sync
sudo systemctl status catalogo-automation --no-pager
sudo systemctl status catalogo-sheet-sync --no-pager
```

## Observações

- `npm run preview` não é recomendado para produção; o Nginx deve servir `dist/`.
- o arquivo `.env` atual do projeto contém segredos reais. Mova os segredos para `/var/www/catalogo/shared/.env` no servidor.
- o webhook agora exige token. Se o emissor não enviar esse token, os pedidos vão falhar com `401`.
- o serviço do webhook só recupera pedidos presos em `PROCESSING` ao subir se `SAIBWEB_RECOVER_PROCESSING_ON_BOOT=1`.
- a fila do webhook ainda é em memória. O recovery no boot reduz impacto, mas não substitui uma fila persistida em banco.
