"use client";

// Last-resort boundary for errors thrown in the root layout itself. It must
// render its own <html>/<body> (it replaces the root layout) and can't rely on
// the app's CSS, so styles are inline.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="th">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          background: "#09090b",
          color: "#d4d4d8",
          fontFamily: "system-ui, sans-serif",
          padding: 24,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, color: "#fafafa" }}>
          เกิดข้อผิดพลาดร้ายแรง
        </h2>
        <p style={{ maxWidth: 480, textAlign: "center", fontSize: 14, color: "#71717a" }}>
          {error?.message || "แอปทำงานผิดพลาด"}
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: 8,
            border: "none",
            borderRadius: 6,
            background: "#0d9488",
            color: "#fff",
            padding: "6px 12px",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          ลองใหม่
        </button>
      </body>
    </html>
  );
}
