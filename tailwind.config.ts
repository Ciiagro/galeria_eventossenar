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
        // Os cinco valores humanos (cores da apresentação do projeto)
        valor: {
          paz: "#8E5BB5",
          amor: "#E03A3E",
          verdade: "#2F9E62",
          acao: "#F2B705",
          naoviolencia: "#2678C4",
        },
        // Cores da logo "Projeto Valores"
        logo: {
          azul: "#5BB8EC",
          laranja: "#F26122",
          roxo: "#A98BC9",
          verde: "#A6CE3A",
          amarelo: "#FFC72C",
          rosa: "#F49AC1",
        },
        sol: { DEFAULT: "#FBCB3C", creme: "#FFF6EA" },
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
