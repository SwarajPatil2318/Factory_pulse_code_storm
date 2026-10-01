/** Shared semantic tokens for the FactoryPulse light interface. */
export const designTokens = {
  color: {
    background: "#F6F8F7",
    surface: "#FFFFFF",
    surfaceMuted: "#F9FBFA",
    border: "#E1E7E4",
    text: "#202B29",
    textMuted: "#66736E",
    primary: "#27664D",
    primarySoft: "#E8F1EC",
    secondary: "#5D7482",
    secondarySoft: "#EDF2F4",
    warning: "#A36A18",
    warningSoft: "#FFF4DF",
    critical: "#B54742",
    criticalSoft: "#FCEDEA"
  },
  radius: { sm: "6px", md: "10px", lg: "14px" },
  shadow: { card: "0 1px 3px rgba(24, 39, 33, .04)" },
  spacing: { contentMax: "1440px", sidebar: "260px" }
} as const;
