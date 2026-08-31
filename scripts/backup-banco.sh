#!/usr/bin/env bash
#
# Backup diário do banco do catálogo de funcionários.
#
# Por que isto existe (31/08/2026): até hoje NÃO havia backup nenhum agendado.
# Os arquivos soltos em ~/backups eram todos manuais, tirados antes de operações
# de risco, e parciais — ou só `employees`, ou só `orders`+`order_items`. O
# sistema tem saldo de funcionário (dinheiro), pedidos e a integração com o
# CIGAM dentro de um volume Docker: se o volume morresse, o ponto de retorno era
# o que alguém tivesse lembrado de dumpar na mão.
#
# DECISÕES QUE IMPORTAM AQUI:
#
# 1. Formato `custom` (-Fc), não SQL puro: já vem comprimido, permite restaurar
#    tabela por tabela e é verificável sem restaurar (pg_restore -l).
#
# 2. Escreve em `.parcial` e só renomeia no fim. Dump interrompido no meio (disco
#    cheio, container reiniciando) não pode ficar parecendo backup bom — é
#    exatamente o tipo de arquivo que só se descobre quebrado na hora do
#    desespero.
#
# 3. VERIFICA o que gravou. `pg_restore -l` lê o índice do arquivo: se não
#    listar objeto nenhum, o dump não presta e o script falha em vez de rotacionar
#    por cima de um backup bom.
#
# 4. Rotação preserva o dia 01 de cada mês. Diário some em 30 dias; mensal fica.
#
# 5. Grava `ultimo-sucesso.txt`. O vigia lê esse arquivo e grita se envelhecer —
#    backup que falha calado é a mesma doença do cron que ficou 4 meses morto
#    empilhando erro em log que ninguém abria.
#
set -euo pipefail

CONTAINER="supabase_db_supabase"
DEST="/home/xulio/backups/catalogo-funcionarios"
LOG="/home/xulio/backups/backup.log"
DIAS_DIARIO=30

mkdir -p "$DEST"

registra() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') | $*" >> "$LOG"
}

falhou() {
  registra "ERRO: $*"
  exit 1
}

carimbo="$(date +%Y%m%d-%H%M%S)"
alvo="$DEST/catalogo-$carimbo.dump"
parcial="$alvo.parcial"

registra "início do backup"

if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  falhou "container $CONTAINER não está rodando"
fi

if ! docker exec "$CONTAINER" pg_dump -U postgres -d postgres -Fc > "$parcial" 2>>"$LOG"; then
  rm -f "$parcial"
  falhou "pg_dump falhou"
fi

# Um dump vazio ou minúsculo não é backup. 100 KB é folga larga para um banco
# de 35 MB comprimido — serve só para pegar arquivo obviamente truncado.
tamanho=$(stat -c%s "$parcial")
if [ "$tamanho" -lt 102400 ]; then
  rm -f "$parcial"
  falhou "dump saiu com apenas $tamanho bytes"
fi

# A verificação de verdade: o arquivo tem índice legível e objetos dentro?
objetos=$(docker exec -i "$CONTAINER" pg_restore -l < "$parcial" 2>>"$LOG" | grep -c ';' || true)
if [ "${objetos:-0}" -lt 50 ]; then
  rm -f "$parcial"
  falhou "pg_restore -l listou só ${objetos:-0} objeto(s) — dump não confiável"
fi

mv "$parcial" "$alvo"

# Roles/senhas do cluster: pequeno, e sem isso um restore em máquina nova
# esbarra em dono de objeto inexistente.
docker exec "$CONTAINER" pg_dumpall -U postgres --globals-only 2>>"$LOG" \
  | gzip > "$DEST/globals-$carimbo.sql.gz" || registra "aviso: globals falhou (backup principal está de pé)"

registra "OK: $(basename "$alvo") — $(du -h "$alvo" | cut -f1), $objetos objetos"

# Rotação: apaga diário com mais de $DIAS_DIARIO dias, MENOS os do dia 01.
apagados=0
while IFS= read -r antigo; do
  dia="$(basename "$antigo" | sed -E 's/^[a-z]+-[0-9]{6}([0-9]{2})-.*/\1/')"
  if [ "$dia" = "01" ]; then continue; fi
  rm -f "$antigo"
  apagados=$((apagados + 1))
done < <(find "$DEST" -maxdepth 1 -name '*.dump' -o -name 'globals-*.sql.gz' | \
         xargs -r -I{} find {} -mtime +"$DIAS_DIARIO" 2>/dev/null)

[ "$apagados" -gt 0 ] && registra "rotação: $apagados arquivo(s) antigo(s) removido(s)"

date -Iseconds > "$DEST/ultimo-sucesso.txt"
registra "fim"
