import { ImageUpload } from "@/components/upload/ImageUpload";

export default function NewAuditPage() {
  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-2">Novo holerite</h1>
      <p className="text-sm text-gray-500 mb-8">
        Tire uma foto do contracheque ou faça upload de uma imagem ou PDF.
        Os dados são processados com segurança e ficam salvos na sua conta.
      </p>
      <ImageUpload />
    </div>
  );
}
