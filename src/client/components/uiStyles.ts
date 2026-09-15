import type { CSSProperties } from "react";

// Shared styles support existing forms that add local layout overrides.
export const inputStyle = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  padding: "9px 12px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-control)",
  background: "var(--surface-input)",
  color: "var(--text)",
  fontSize: "13px",
} satisfies CSSProperties;

export const secondaryButtonStyle = {
  padding: "9px 14px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-control)",
  background: "var(--surface-raised)",
  color: "var(--text)",
  cursor: "pointer",
  fontWeight: 600,
} satisfies CSSProperties;

// Compact controls also serve neutral toolbar and row actions.
export const controlStyle = {
  padding: "9px 12px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-control)",
  background: "var(--surface-raised)",
  color: "var(--text)",
  fontSize: "12px",
  minWidth: 0,
} satisfies CSSProperties;
