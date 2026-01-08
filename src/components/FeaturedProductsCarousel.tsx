import React, { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  /** Passe seus ProductCards aqui (já renderizados) */
  items: React.ReactNode[];

  /** px/seg (quanto maior, mais rápido). Recomendo 18–28 */
  speedPxPerSec?: number;

  /** largura mínima do “card slot” (ajusta o tamanho do destaque) */
  itemMinWidth?: number;

  /** gap entre cards */
  gap?: number;

  /** altura do carrossel (auto) */
  className?: string;

  /** título opcional */
  title?: string;
};

export default function FeaturedProductsCarousel({
  items,
  speedPxPerSec = 22,
  itemMinWidth = 260,
  gap = 16,
  className = "",
  title = "Destaques",
}: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  // offset atual (px) para translateX
  const offsetRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);

  const [isHover, setIsHover] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // drag state
  const dragStartXRef = useRef<number | null>(null);
  const dragStartOffsetRef = useRef<number>(0);

  // duplicamos a lista pra virar “infinita”
  const loopItems = useMemo(() => {
    if (!items?.length) return [];
    // duplica 3x pra garantir preenchimento
    return [...items, ...items, ...items];
  }, [items]);

  // largura total da “1ª volta” (um bloco de items original) pra fazer wrap perfeito
  const loopWidthRef = useRef<number>(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const compute = () => {
      // Medimos a largura do “bloco” original
      // Como duplicamos 3x, dividimos por 3.
      const total = track.scrollWidth;
      loopWidthRef.current = total / 3;
    };

    // calcula ao montar e também quando imagens carregarem
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(track);

    return () => ro.disconnect();
  }, [loopItems]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    let rafId = 0;

    const tick = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000; // sec
      lastTsRef.current = ts;

      const shouldPause = isHover || isDragging;
      if (!shouldPause && loopItems.length > 0) {
        offsetRef.current -= speedPxPerSec * dt;
      }

      // wrap infinito
      const loopW = loopWidthRef.current;
      if (loopW > 0) {
        // Mantém offset sempre dentro de [-loopW, 0]
        if (offsetRef.current <= -loopW) offsetRef.current += loopW;
        if (offsetRef.current > 0) offsetRef.current -= loopW;
      }

      track.style.transform = `translate3d(${offsetRef.current}px, 0, 0)`;
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      lastTsRef.current = null;
    };
  }, [isHover, isDragging, loopItems.length, speedPxPerSec]);

  function onPointerDown(e: React.PointerEvent) {
    const viewport = viewportRef.current;
    if (!viewport) return;

    setIsDragging(true);
    dragStartXRef.current = e.clientX;
    dragStartOffsetRef.current = offsetRef.current;

    // capturar pointer (melhor no mobile)
    try {
      (e.currentTarget as any).setPointerCapture?.(e.pointerId);
    } catch {}
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!isDragging) return;
    if (dragStartXRef.current == null) return;

    const dx = e.clientX - dragStartXRef.current;
    offsetRef.current = dragStartOffsetRef.current + dx;
  }

  function onPointerUp(e: React.PointerEvent) {
    setIsDragging(false);
    dragStartXRef.current = null;

    try {
      (e.currentTarget as any).releasePointerCapture?.(e.pointerId);
    } catch {}
  }

  if (!items?.length) return null;

  return (
    <section className={`w-full ${className}`}>
      {/* headerzinho */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
            <span className="text-red-600 font-bold">★</span>
          </div>
          <div className="leading-tight">
            <div className="text-sm md:text-base font-semibold text-gray-900">
              {title}
            </div>
            <div className="text-[11px] md:text-xs text-gray-500">
              Passe o mouse ou arraste para controlar
            </div>
          </div>
        </div>
      </div>

      {/* viewport */}
      <div
        ref={viewportRef}
        className="
          relative overflow-hidden rounded-2xl
          border border-gray-200 bg-white/60 backdrop-blur-md
          shadow-sm
        "
        style={{
          // Máscara que faz as laterais ficarem mais transparentes (efeito do Canva)
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)",
          maskImage:
            "linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)",
        }}
        onMouseEnter={() => setIsHover(true)}
        onMouseLeave={() => setIsHover(false)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* track */}
        <div
          ref={trackRef}
          className="flex items-stretch will-change-transform select-none touch-pan-y"
          style={{
            gap,
            padding: 14,
            transform: "translate3d(0px,0px,0px)",
          }}
        >
          {loopItems.map((node, idx) => (
            <div
              key={idx}
              className="
                shrink-0
                transition-transform
                hover:scale-[1.02]
              "
              style={{
                minWidth: itemMinWidth,
                opacity: 0.92, // “um pouco mais transparente” no geral
              }}
            >
              {/* seu ProductCard vem aqui */}
              {node}
            </div>
          ))}
        </div>

        {/* leve brilho/overlay pra ficar “premium” */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(1200px 260px at 50% 0%, rgba(255,255,255,0.55), transparent 60%)",
            }}
          />
        </div>
      </div>
    </section>
  );
}
