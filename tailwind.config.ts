import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1E4632",   // verde escuro da sidebar
          dark: "#122E20",
          light: "#2F6B4F",     // verde de botões/ações
          accent: "#3F8360",
        },
        status: {
          completo: "#2F855A",
          parcial: "#C08A1E",
          pendente: "#C0392B",
        },
        cream: "#F7F6F2",
      },
      // textos pequenos um pouco maiores, para leitura mais confortável
      fontSize: {
        xs: ["0.8125rem", { lineHeight: "1.15rem" }], // 13px (padrão era 12px)
        sm: ["0.9375rem", { lineHeight: "1.4rem" }],  // 15px (padrão era 14px)
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
