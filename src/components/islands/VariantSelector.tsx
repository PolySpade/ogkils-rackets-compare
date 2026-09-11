import { useState } from 'react';
import type { Variant } from '../../lib/types';

interface Props {
  variants: Variant[];
}

const DASH = '—';

function Row({
  label,
  value,
  unit,
  termKey,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  termKey?: string;
}) {
  const missing = value === null || value === undefined || value === '';
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-0">
      <dt className="flex items-center text-sm text-fg-muted">
        {label}
        {termKey && (
          <a
            href={`/guide/racket-specs#${termKey}`}
            className="spec-help"
            aria-label={`What is ${label}? Opens the spec guide.`}
          >
            ?
          </a>
        )}
      </dt>
      <dd className={missing ? 'text-sm text-fg-faint' : 'tnum text-[0.95rem] font-semibold text-fg'}>
        {missing ? DASH : value}
        {!missing && unit ? <span className="spec-unit">{unit}</span> : null}
        {missing && <span className="sr-only">Not published</span>}
      </dd>
    </div>
  );
}

export default function VariantSelector({ variants }: Props) {
  const [index, setIndex] = useState(0);
  const v = variants[index]!;

  return (
    <div>
      {variants.length > 1 && (
        <div role="group" aria-label="Weight class" className="segmented mb-4">
          {variants.map((variant, i) => (
            <button
              key={variant.weightClass}
              type="button"
              aria-pressed={i === index}
              onClick={() => setIndex(i)}
            >
              {variant.weightClass}
            </button>
          ))}
        </div>
      )}

      <dl key={index} className="fade">
        <Row
          label="Weight"
          value={`${v.weightRangeG[0]}–${v.weightRangeG[1]}`}
          unit="g"
          termKey="weight-class"
        />
        <Row label="Grip sizes" value={v.gripSizes.join(' · ')} termKey="grip-size" />
        <Row
          label="Balance point"
          value={v.balancePointMm}
          unit={`± ${v.balancePointToleranceMm} mm`}
          termKey="balance-point"
        />
        <Row label="Max tension" value={v.maxTensionLbs} unit="lbs" termKey="max-tension" />
        <Row
          label="Swing weight"
          value={v.swingWeightMissing ? null : v.swingWeight}
          termKey="swing-weight"
        />
      </dl>
    </div>
  );
}
