/**
 * Garante que ninguém fique rodando um bundle velho.
 *
 * São duas metades do mesmo conserto:
 *
 * - `public/sw-auto-reload.js` age do lado do service worker e alcança até quem
 *   está preso num bundle antigo (o navegador re-executa o `sw.js` a cada
 *   visita, mesmo que o JS da página seja de meses atrás);
 * - este arquivo age do lado do app, para o navegador em que
 *   `WindowClient.navigate()` não funciona, e para procurar deploy novo em quem
 *   deixa o PWA aberto por dias sem nunca recarregar.
 *
 * Recarregar é seguro: carrinho, sessão, filtros e cache de produtos moram no
 * `localStorage`, então nada que o usuário digitou se perde.
 */

/** De quanto em quanto tempo uma aba aberta procura deploy novo. */
const INTERVALO_DE_CHECAGEM_MS = 30 * 60 * 1000;

export function watchServiceWorkerUpdates(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  // Se não havia worker no controle, esta é a primeira visita: o
  // `controllerchange` que vem a seguir é da instalação inicial, e recarregar
  // aí seria um susto sem motivo.
  const tinhaWorkerNoControle = Boolean(navigator.serviceWorker.controller);
  let recarregando = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!tinhaWorkerNoControle || recarregando) return;
    recarregando = true;
    window.location.reload();
  });

  navigator.serviceWorker.ready
    .then((registro) => {
      const procurarAtualizacao = () => {
        registro.update().catch(() => {
          // Sem rede ou servidor fora: tenta de novo na próxima chance.
        });
      };

      window.setInterval(procurarAtualizacao, INTERVALO_DE_CHECAGEM_MS);

      // No celular o app quase nunca é fechado, só sai e volta do segundo
      // plano — é aí que vale a pena olhar se saiu deploy.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") procurarAtualizacao();
      });
    })
    .catch(() => {
      // Nenhum service worker registrado (dev sem PWA, por exemplo).
    });
}
