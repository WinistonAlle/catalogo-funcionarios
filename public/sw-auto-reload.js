/**
 * Recarrega sozinho as abas que ficaram com o bundle antigo.
 *
 * O `sw.js` gerado já faz `skipWaiting()` + `clientsClaim()`, então o service
 * worker novo assume o controle na hora. Só que isso NÃO recarrega a página: a
 * aba aberta continua executando o JS que já estava na memória. Foi assim que
 * em 18/08/2026 um admin bateu em "Esta conta exige login com senha" — JS de
 * antes de 13/08 conversando com o banco novo, que já barrava o vínculo por CPF
 * para admin/RH.
 *
 * Este script é injetado no `sw.js` (`workbox.importScripts` no vite.config).
 * Como o navegador rebaixa e re-executa o `sw.js` a cada visita, ele conserta
 * até quem está preso num bundle que não conhece esta correção — o usuário só
 * precisa abrir o app, sem limpar cache nem aba anônima.
 */

const RELOAD_MARKER_CACHE = "gm-sw-reload";
const RELOAD_MARKER_URL = "/__gm-sw-era-atualizacao";

/**
 * Só recarrega quando isto é uma ATUALIZAÇÃO, nunca na primeira instalação —
 * senão todo visitante novo levaria um reload sem motivo.
 *
 * `self.registration.active` no `install` é o service worker que está sendo
 * substituído: existe quando é atualização, é `null` na primeira vez. A
 * resposta vai para um cache porque o worker pode ser desligado entre o
 * `install` e o `activate`, e aí uma variável em memória se perderia.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const eraAtualizacao = Boolean(self.registration.active);
      const cache = await caches.open(RELOAD_MARKER_CACHE);
      await cache.put(RELOAD_MARKER_URL, new Response(eraAtualizacao ? "1" : "0"));
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(RELOAD_MARKER_CACHE);
      const marcador = await cache.match(RELOAD_MARKER_URL);
      const eraAtualizacao = (await marcador?.text()) === "1";
      await cache.delete(RELOAD_MARKER_URL);

      if (!eraAtualizacao) return;

      // `navigate()` só vale para janela que este worker já controla.
      await self.clients.claim();

      const janelas = await self.clients.matchAll({ type: "window" });
      await Promise.all(
        janelas.map((janela) =>
          // Uma aba fora do escopo (ou um navegador sem `navigate()`, como o
          // Safari antigo) simplesmente não recarrega — o listener de
          // `controllerchange` no app cobre esse caso.
          janela.navigate(janela.url).catch(() => {})
        )
      );
    })()
  );
});
