// Simple toggle UI
const SimpleToggle = ({ checked, onChange, disabled }) => {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange && onChange(!checked)}
      disabled={disabled}
      className={[
        "inline-flex h-6 w-11 items-center rounded-full transition",
        checked ? "bg-emerald-600" : "bg-slate-300",
        disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
      aria-pressed={checked}
      aria-label="Toggle Active"
    >
      <span
        className={[
          "h-5 w-5 rounded-full bg-white shadow transform transition",
          checked ? "translate-x-5" : "translate-x-1",
        ].join(" ")}
      />
    </button>
  );
}

export default SimpleToggle