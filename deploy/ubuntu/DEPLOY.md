# Deploy Ubuntu

## Arquitetura recomendada

- `Nginx` serve o frontend estático (`dist/`)
- `systemd` mantém a automação `automation/saibweb-webhook.ts`
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
cp deploy/ubuntu/.env.server.example /var/www/catalogo/shared/.env
npm run build
```

Edite `/var/www/catalogo/shared/.env` com as variáveis reais.

## 3. systemd

Copie o serviço:

```bash
sudo cp deploy/ubuntu/catalogo-automation.service /etc/systemd/system/catalogo-automation.service
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
sudo systemctl status catalogo-automation
```

Logs:

```bash
journalctl -u catalogo-automation -f
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
curl http://127.0.0.1:3333/health
curl http://funcionarios.gostinhomineiro.com/automation/health
```

Webhook:

```bash
curl -X POST http://funcionarios.gostinhomineiro.com/automation/webhook/new-order \
  -H 'Content-Type: application/json' \
  -d '{"order_id":"test"}'
```

## Observações

- `npm run preview` não é recomendado para produção; o Nginx deve servir `dist/`.
- o arquivo `.env` atual do projeto contém segredos reais. Mova os segredos para `/var/www/catalogo/shared/.env` no servidor.
- a fila do webhook é em memória. Se o serviço reiniciar, a fila pendente é perdida.
