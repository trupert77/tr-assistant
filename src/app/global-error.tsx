"use client";

/**
 * Last resort: replaces the root layout when it fails to render, so
 * globals.css may not be loaded. Styles are inline for that reason.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" style={{ colorScheme: "dark" }}>
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "#131110",
          color: "#f3ece5",
          fontFamily: 'ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace',
        }}
      >
        <div style={{ maxWidth: 360, textAlign: "center" }}>
          <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 8px" }}>
            TR Assistant hit an error
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: "#a69c94", margin: "0 0 20px" }}>
            {error.message || "Something went wrong while loading the app."}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 48,
              padding: "0 24px",
              borderRadius: 999,
              border: 0,
              fontWeight: 700,
              fontSize: 14,
              fontFamily: "inherit",
              color: "#1a0e04",
              background: "linear-gradient(90deg, #fb923c, #fbbf24)",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
