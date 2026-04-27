import { Toaster } from "react-hot-toast"

export function CustomToaster() {
  return (
    <Toaster
      position="top-right"
      gutter={8}
      toastOptions={{
        duration: 3000,
        style: {
          background: "rgba(18,18,22,0.92)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          color: "#f4f4f5",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "12px",
          fontSize: "13px",
          fontFamily: "'Inter', system-ui, sans-serif",
          fontWeight: 400,
          padding: "10px 14px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          maxWidth: "320px",
        },
        success: {
          duration: 2000,
          iconTheme: {
            primary: "#10b981",
            secondary: "rgba(18,18,22,0.92)",
          },
          style: {
            border: "1px solid rgba(16,185,129,0.2)",
          },
        },
        error: {
          duration: 4000,
          iconTheme: {
            primary: "#f87171",
            secondary: "rgba(18,18,22,0.92)",
          },
          style: {
            border: "1px solid rgba(248,113,113,0.2)",
          },
        },
        loading: {
          iconTheme: {
            primary: "#10b981",
            secondary: "rgba(18,18,22,0.92)",
          },
        },
      }}
    />
  )
}