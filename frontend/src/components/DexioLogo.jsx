export default function DexioLogo({ size = "md" }) {
  const cfg = {
    sm: { icon: 24, name: 15, ai: 11, gap: 8 },
    md: { icon: 30, name: 19, ai: 12, gap: 10 },
    lg: { icon: 38, name: 24, ai: 15, gap: 12 },
  }
  const c = cfg[size] || cfg.md

  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: c.gap + "px",
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
        <path d="M20 3L35 11.5V28.5L20 37L5 28.5V11.5L20 3Z" fill="#2d1f6e" stroke="#7c3aed" strokeWidth="1.4" />
        <path d="M14 13H21C25.4 13 28 15.6 28 20C28 24.4 25.4 27 21 27H14V13Z" fill="none" stroke="#a78bfa" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M17 16.5H20.5C23 16.5 24.5 17.9 24.5 20C24.5 22.1 23 23.5 20.5 23.5H17V16.5Z" fill="#7c3aed" />
        <circle cx="20" cy="7" r="1.5" fill="#a78bfa" />
      </svg>

      {/* Use <b> and <em> — NOT <span> — to avoid .auth-logo span badge styles */}
      <b style={{
        fontFamily: "'Sora', system-ui, sans-serif",
        fontWeight: 700,
        fontSize: c.name + "px",
        color: "#e2d9f3",
        letterSpacing: "-0.02em",
        lineHeight: 1,
        background: "none",
        padding: 0,
        margin: 0,
        border: "none",
        borderRadius: 0,
      }}>Dexio</b>
      <em style={{
        fontFamily: "'Sora', system-ui, sans-serif",
        fontWeight: 400,
        fontStyle: "normal",
        fontSize: c.ai + "px",
        color: "#a78bfa",
        letterSpacing: "0.05em",
        lineHeight: 1,
        background: "none",
        padding: 0,
        margin: 0,
        border: "none",
        borderRadius: 0,
      }}>AI</em>

    </div>
  )
}