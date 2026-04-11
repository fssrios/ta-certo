const TOLERANCE = 0.05;

interface SummaryCardProps {
  label: string;
  declared: number;
  expected: number;
  isInfo?: boolean;
}

export function SummaryCard({ label, declared, expected, isInfo }: SummaryCardProps) {
  const diff = Math.abs(declared - expected);
  const isOk = diff <= TOLERANCE;

  const bg = isInfo
    ? "bg-gray-50 border-gray-200"
    : isOk
    ? "bg-green-50 border-green-200"
    : "bg-red-50 border-red-200";

  const valueColor = isInfo
    ? "text-gray-700"
    : isOk
    ? "text-green-700"
    : "text-red-700";

  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-bold ${valueColor}`}>{fmt(declared)}</p>
      {!isOk && (
        <p className="text-xs text-gray-400 mt-0.5">Esp.: {fmt(expected)}</p>
      )}
      {isOk && (
        <p className="text-xs text-gray-400 mt-0.5">
          {isInfo ? "Depósito patronal" : "Correto"}
        </p>
      )}
    </div>
  );
}

function fmt(n: number) {
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
