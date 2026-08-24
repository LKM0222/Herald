import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // 상대 경로로 뽑는다. 같은 번들이 GitHub Pages 하위 경로(/Herald/)에서도,
  // 나중에 크롬 확장(chrome-extension://…) 안에서도 그대로 동작해야 하기 때문.
  base: "./",

  plugins: [react(), tailwindcss()],

  resolve: {
    alias: { "@shared": path.resolve(import.meta.dirname, "../shared") },
  },

  // shared/ 가 client/ 밖이라 dev 서버에 읽기 허용을 준다.
  server: { fs: { allow: [".."] } },
});
