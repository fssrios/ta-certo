import { ImageUpload } from "@/components/upload/ImageUpload";

export default function NewAuditPage() {
  return (
    <div className="max-w-2xl mx-auto">
      {/* Header text */}
      <div className="text-center mb-12">
        <div className="text-xs tracking-widest text-tc-accent font-bold mb-4">VAMOS LÁ</div>
        <h1 className="font-display text-5xl sm:text-6xl font-normal tracking-tight leading-[1] mb-4">
          Envie seu holerite.<br />
          <em className="text-tc-accent not-italic">Nós cuidamos do resto.</em>
        </h1>
        <p className="text-base text-[var(--tc-ink-soft)] max-w-md mx-auto leading-relaxed">
          Foto, PDF ou print. A gente reconhece automaticamente e começa a conferência.
        </p>
      </div>

      {/* Upload component */}
      <ImageUpload />
    </div>
  );
}
