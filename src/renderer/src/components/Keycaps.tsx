/** One cap per key (R3 §5) - caps come from `keycaps()` in the registry. */
export function Keycaps({ caps, className = '' }: { caps: string[], className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-[3px] ${className}`}>
      {caps.map((cap, index) => (
        <kbd
          key={index}
          className="min-w-[18px] rounded border border-keycap-edge bg-keycap-bg px-[5px] py-px text-center text-[11px] font-normal text-keycap-ink"
        >
          {cap}
        </kbd>
      ))}
    </span>
  )
}
