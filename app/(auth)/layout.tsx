export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-tc-bg">
      {/* Left — form column */}
      <div className="flex flex-col justify-between px-8 sm:px-14 py-10 min-h-screen">
        {children}
      </div>

      {/* Right — social proof column */}
      <div className="hidden md:flex flex-col justify-between bg-tc-green text-tc-paper px-12 py-14 relative overflow-hidden">
        {/* Glow */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: 600, height: 600,
            background: "radial-gradient(circle, rgba(201,126,75,.3) 0%, transparent 60%)",
            right: -200, top: -100,
          }}
        />

        <div className="relative text-xs tracking-widest text-tc-accent font-bold">
          QUEM USA RECOMENDA
        </div>

        <div className="relative">
          <div className="font-display text-[100px] leading-[0.5] text-tc-accent opacity-70">&ldquo;</div>
          <blockquote className="font-display text-[2rem] font-normal mt-3 mb-8 leading-snug italic tracking-tight">
            Em menos de um minuto eu já sabia quanto estavam me devendo — e com qual artigo da lei cobrar.
          </blockquote>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-tc-accent text-white grid place-items-center font-display font-medium text-2xl">
              R
            </div>
            <div>
              <div className="font-semibold">Rosângela O.</div>
              <div className="text-xs opacity-70">Técnica de enfermagem · Duque de Caxias</div>
            </div>
          </div>
        </div>

        <div className="relative grid grid-cols-3 gap-4 pt-7 border-t border-white/20">
          {[["28 mil", "auditados"], ["R$1,2M", "devolvidos"], ["4.9", "avaliação"]].map(([num, label]) => (
            <div key={label}>
              <div className="font-display text-3xl font-medium text-tc-accent tracking-tight">{num}</div>
              <div className="text-xs opacity-70 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
