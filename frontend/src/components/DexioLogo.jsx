export default function DexioLogo({ size = "md", showText = true }) {
  const cfg = {
    sm: { icon: 22, name: 14, ai: 10, gap: 7 },
    md: { icon: 28, name: 17, ai: 11, gap: 9 },
    lg: { icon: 36, name: 22, ai: 14, gap: 10 },
    xl: { icon: 44, name: 27, ai: 16, gap: 12 },
  }
  const c = cfg[size] || cfg.md

  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: showText ? c.gap + "px" : "0",
      width: "fit-content",
      flexShrink: 0,
      whiteSpace: "nowrap",
      background: "none",
      padding: 0,
      margin: 0,
    }}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 40 40"
        fill="none"
        style={{
          width: c.icon + "px",
          height: c.icon + "px",
          minWidth: c.icon + "px",
          maxWidth: c.icon + "px",
          display: "block",
          flexShrink: 0,
        }}
      >
        <defs>
          <linearGradient id="dexio_bg" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
            <stop stopColor="#064e3b" />
            <stop offset="1" stopColor="#022c22" />
          </linearGradient>
          <linearGradient id="dexio_d" x1="13" y1="12" x2="28" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="#10b981" />
            <stop offset="1" stopColor="#047857" />
          </linearGradient>
        </defs>

        {/* Rounded square background */}
        <rect x="2" y="2" width="36" height="36" rx="10" fill="url(#dexio_bg)" stroke="#065f46" strokeWidth="1.2" />

        {/* D letterform — outer stroke */}
        <path
          d="M13 12H21C25.4 12 28.5 15.2 28.5 20C28.5 24.8 25.4 28 21 28H13V12Z"
          fill="none"
          stroke="#6ee7b7"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />

        {/* D letterform — filled body */}
        <path
          d="M16.5 15.5H20.5C23.2 15.5 24.8 17.4 24.8 20C24.8 22.6 23.2 24.5 20.5 24.5H16.5V15.5Z"
          fill="url(#dexio_d)"
        />

        {/* Accent dot */}
        <circle cx="28" cy="12" r="2" fill="#10b981" />
      </svg>

      {showText && (
        <>
          <b style={{
            fontFamily: "'Space Grotesk', 'Sora', system-ui, sans-serif",
            fontWeight: 700,
            fontSize: c.name + "px",
            color: "#f4f4f5",
            letterSpacing: "-0.02em",
            lineHeight: 1,
            background: "none",
            padding: 0,
            margin: 0,
            border: "none",
            borderRadius: 0,
          }}>Dexio</b>
          <em style={{
            fontFamily: "'Space Grotesk', 'Sora', system-ui, sans-serif",
            fontWeight: 700,
            fontStyle: "normal",
            fontSize: c.ai + "px",
            color: "#10b981",
            letterSpacing: "0.05em",
            lineHeight: 1,
            background: "none",
            padding: 0,
            margin: 0,
            border: "none",
            borderRadius: 0,
            marginLeft: "-1px",
          }}>AI</em>
        </>
      )}
    </div>
  )
}