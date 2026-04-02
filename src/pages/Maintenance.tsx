import React from "react";

const WHATSAPP_LINK =
  "https://wa.me/5561935057871?text=Gostaria%20de%20fazer%20um%20pedido.";

const Maintenance: React.FC = () => {
  return (
    <main className="min-h-screen overflow-hidden bg-stone-950 text-stone-50">
      <div className="relative isolate min-h-screen">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(220,38,38,0.24),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.18),_transparent_28%),linear-gradient(180deg,_#1c1917_0%,_#0c0a09_100%)]" />
        <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.22)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.22)_1px,transparent_1px)] [background-size:56px_56px]" />

        <div className="relative mx-auto flex min-h-screen max-w-6xl items-center px-4 py-10 sm:px-6 sm:py-16">
          <section className="grid w-full gap-5 sm:gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div className="max-w-3xl">
              <div className="mb-5 inline-flex items-center rounded-full border border-red-500/35 bg-red-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-red-200 sm:mb-6 sm:px-4 sm:text-xs sm:tracking-[0.32em]">
                Sistema em manutenção
              </div>

              <h1 className="max-w-2xl text-[2.15rem] font-black uppercase leading-[0.95] text-stone-50 sm:text-6xl">
                Estamos realizando correções e melhorias no sistema.
              </h1>

              <p className="mt-5 max-w-2xl text-[15px] leading-7 text-stone-300 sm:mt-6 sm:text-lg">
                O catálogo está temporariamente indisponível enquanto concluímos os ajustes.
              </p>

              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl bg-[#25D366] px-6 py-4 text-center text-sm font-bold uppercase tracking-[0.18em] text-white shadow-[0_18px_40px_rgba(37,211,102,0.28)] transition hover:bg-[#22c55e] sm:mt-8 sm:w-auto sm:text-base"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 32 32"
                  className="h-5 w-5 shrink-0 fill-current"
                >
                  <path d="M19.11 17.35c-.29-.15-1.73-.86-1.99-.96-.27-.1-.47-.15-.67.15-.2.29-.76.96-.94 1.16-.17.2-.35.22-.64.07-.29-.15-1.24-.46-2.35-1.46-.87-.78-1.46-1.75-1.63-2.05-.17-.29-.02-.45.13-.6.13-.13.29-.35.44-.52.15-.17.2-.29.29-.49.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.91-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.29-1.03 1.01-1.03 2.47s1.05 2.87 1.2 3.07c.15.2 2.05 3.13 4.97 4.39.69.3 1.24.48 1.66.61.7.22 1.33.19 1.84.11.56-.08 1.73-.71 1.97-1.4.24-.69.24-1.28.17-1.4-.07-.12-.27-.2-.56-.35Z" />
                  <path d="M16.01 3.2c-7.08 0-12.82 5.73-12.82 12.8 0 2.26.59 4.47 1.72 6.41L3.1 28.8l6.57-1.72a12.82 12.82 0 0 0 6.34 1.67h.01c7.07 0 12.81-5.74 12.81-12.81 0-3.42-1.33-6.64-3.75-9.06A12.73 12.73 0 0 0 16.01 3.2Zm0 23.38h-.01a10.6 10.6 0 0 1-5.4-1.48l-.39-.23-3.9 1.02 1.04-3.8-.25-.39a10.54 10.54 0 0 1-1.63-5.65c0-5.84 4.76-10.59 10.61-10.59 2.82 0 5.48 1.1 7.48 3.11a10.5 10.5 0 0 1 3.1 7.48c0 5.85-4.76 10.6-10.6 10.6Z" />
                </svg>
                Fazer pedido pelo WhatsApp
              </a>
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5 backdrop-blur-sm sm:rounded-[2rem] sm:p-8">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-300 sm:text-sm sm:tracking-[0.28em]">
                Aviso importante
              </div>

              <div className="mt-6 space-y-4 text-stone-200">
                <p className="text-xl font-bold leading-tight sm:text-2xl">
                  Para fazer seu pedido agora, fale com a equipe pelo WhatsApp.
                </p>

                <p className="text-sm leading-6 text-stone-300">
                  Agradecemos a compreensão.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
};

export default Maintenance;
