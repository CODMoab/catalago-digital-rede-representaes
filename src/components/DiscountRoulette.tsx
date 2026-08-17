import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, Trophy, ArrowRight, Gift, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface RouletteProps {
  customerName: string;
  onFinished: (discountPercent: number) => void;
}

interface Segment {
  label: string;
  sublabel?: string;
  color: string;
  textColor: string;
  isWinner?: boolean;
}

const SEGMENTS: Segment[] = [
  { label: "5% OFF", color: "#059669", textColor: "#ffffff" },
  { label: "15% OFF", sublabel: "ESPECIAL", color: "#10b981", textColor: "#ffffff", isWinner: true },
  { label: "2% OFF", color: "#475569", textColor: "#ffffff" },
  { label: "10% OFF", color: "#047857", textColor: "#ffffff" },
  { label: "50% OFF", sublabel: "SUPER", color: "#d97706", textColor: "#ffffff" },
  { label: "Brinde", sublabel: "VIP", color: "#0284c7", textColor: "#ffffff" },
  { label: "20% OFF", color: "#0f766e", textColor: "#ffffff" },
  { label: "Frete CIF", color: "#334155", textColor: "#ffffff" },
];

export function DiscountRoulette({ customerName, onFinished }: RouletteProps) {
  const [spinning, setSpinning] = useState(false);
  const [hasSpun, setHasSpun] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [confetti, setConfetti] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const numSegments = SEGMENTS.length;
  const segmentAngle = 360 / numSegments;

  // Renderiza a roleta no Canvas com paleta clean e consistente
  const drawWheel = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const radius = center - 12;

    ctx.clearRect(0, 0, size, size);

    // Borda externa clean
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, radius + 8, 0, Math.PI * 2);
    ctx.fillStyle = "#1e293b";
    ctx.shadowColor = "rgba(0,0,0,0.2)";
    ctx.shadowBlur = 10;
    ctx.fill();

    // Luzes decorativas da borda
    for (let i = 0; i < 24; i++) {
      const angle = ((i * 360) / 24) * (Math.PI / 180);
      const dotX = center + (radius + 4) * Math.cos(angle);
      const dotY = center + (radius + 4) * Math.sin(angle);
      ctx.beginPath();
      ctx.arc(dotX, dotY, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? "#10b981" : "#ffffff";
      ctx.fill();
    }
    ctx.restore();

    // Desenha cada fatia
    SEGMENTS.forEach((seg, i) => {
      const startAngle = (i * segmentAngle * Math.PI) / 180;
      const endAngle = ((i + 1) * segmentAngle * Math.PI) / 180;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.stroke();

      // Texto da fatia
      ctx.translate(center, center);
      ctx.rotate(startAngle + (segmentAngle * Math.PI) / 360);
      ctx.textAlign = "right";
      ctx.fillStyle = seg.textColor;
      ctx.font = "bold 13px sans-serif";
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 4;
      ctx.fillText(seg.label, radius - 16, 4);

      if (seg.sublabel) {
        ctx.font = "bold 9px sans-serif";
        ctx.fillStyle = "#fef08a";
        ctx.fillText(seg.sublabel, radius - 16, 16);
      }

      ctx.restore();
    });

    // Centro da roleta
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, 30, 0, Math.PI * 2);
    ctx.fillStyle = "#0f172a";
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#10b981";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(center, center, 18, 0, Math.PI * 2);
    ctx.fillStyle = "#10b981";
    ctx.fill();
    ctx.restore();
  }, [numSegments, segmentAngle]);

  useEffect(() => {
    drawWheel();
  }, [drawWheel]);

  const spin = () => {
    if (spinning || hasSpun) return;
    setSpinning(true);

    // Segmento 1 (15% OFF ESPECIAL):
    // startAngle: 1 * 45 = 45 deg, mid: 67.5 deg
    // Ponteiro no topo (270 deg) -> targetAngleAtTop = (270 - 67.5 + 360) % 360 = 202.5 deg.
    const targetSegmentIndex = 1;
    const targetSegmentMid = (targetSegmentIndex + 0.5) * segmentAngle;
    const targetAngleAtTop = (270 - targetSegmentMid + 360) % 360;

    const extraRounds = 6 * 360; // 6 voltas completas
    const finalRotation = extraRounds + targetAngleAtTop;

    setRotation(finalRotation);

    setTimeout(() => {
      setSpinning(false);
      setHasSpun(true);
      setConfetti(true);
    }, 4800);
  };

  return (
    <div className="flex flex-col items-center text-center">
      {!hasSpun ? (
        <>
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="size-3.5" /> Roleta da Sorte
          </div>

          <h3 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Gire e ganhe seu desconto exclusivo!
          </h3>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground sm:text-sm">
            Bem-vindo(a), <span className="font-semibold text-foreground">{customerName}</span>! Gire agora a roleta da Rede Representações para concorrer a descontos de até 50% no catálogo.
          </p>

          {/* Container da Roleta */}
          <div className="relative my-6 flex items-center justify-center">
            {/* Ponteiro no Topo */}
            <div className="absolute -top-3.5 z-20 flex flex-col items-center">
              <div className="size-0 border-x-[10px] border-x-transparent border-t-[18px] border-t-primary drop-shadow-md" />
            </div>

            <div
              style={{
                transform: `rotate(${rotation}deg)`,
                transition: spinning
                  ? "transform 4.8s cubic-bezier(0.15, 0.9, 0.25, 1)"
                  : "none",
              }}
              className="rounded-full shadow-2xl"
            >
              <canvas
                ref={canvasRef}
                width={290}
                height={290}
                className="max-w-[290px] touch-none"
              />
            </div>
          </div>

          <Button
            size="lg"
            onClick={spin}
            disabled={spinning}
            className="w-full max-w-xs gap-2 text-sm font-bold shadow-md bg-primary hover:bg-primary/90 text-primary-foreground transition-transform hover:scale-105 active:scale-95"
          >
            {spinning ? (
              <>
                <Sparkles className="size-4 animate-spin" /> Girando a roleta...
              </>
            ) : (
              <>
                <Gift className="size-4" /> Girar Roleta da Sorte
              </>
            )}
          </Button>
        </>
      ) : (
        <div className="relative flex flex-col items-center py-2 animate-in fade-in zoom-in-95 duration-500">
          {confetti && (
            <div className="pointer-events-none absolute inset-0 -top-8 flex justify-center overflow-hidden">
              <div className="flex gap-2">
                <span className="text-2xl animate-bounce">🎉</span>
                <span className="text-2xl animate-bounce delay-100">✨</span>
                <span className="text-2xl animate-bounce delay-200">🎁</span>
                <span className="text-2xl animate-bounce delay-300">🎊</span>
                <span className="text-2xl animate-bounce delay-150">⭐</span>
              </div>
            </div>
          )}

          <div className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary border border-primary/20 shadow-sm">
            <Trophy className="size-7 animate-pulse text-primary" />
          </div>

          <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-primary">
            <CheckCircle2 className="size-3.5" /> Prêmio Sorteado!
          </span>

          <h3 className="mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            Parabéns! Você tirou <span className="text-primary">15% OFF</span>
          </h3>

          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            O desconto de <strong className="text-foreground">15%</strong> já foi aplicado em todos os produtos Belliz e Payot.
          </p>

          <div className="my-4 w-full rounded-xl border border-primary/30 bg-primary/5 p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cupom Ativado
            </p>
            <p className="mt-0.5 text-xl font-mono font-bold tracking-widest text-primary">
              REDE15OFF
            </p>

            <div className="mt-3 rounded-lg bg-card border border-primary/20 p-3 text-left shadow-sm">
              <p className="font-bold text-xs text-foreground flex items-center gap-1.5">
                <Sparkles className="size-4 text-primary" /> Faça seu 1º pedido e garanta 15% fixo!
              </p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Confirmando seu primeiro pedido agora, você garante <strong>15% de desconto fixo</strong> para todos os seus próximos pedidos e reposições da loja.
              </p>
            </div>
          </div>

          <Button
            size="lg"
            onClick={() => onFinished(15)}
            className="w-full max-w-xs gap-2 font-bold shadow-md transition-transform hover:scale-105 bg-primary text-primary-foreground"
          >
            Acessar Catálogo com 15% OFF <ArrowRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
