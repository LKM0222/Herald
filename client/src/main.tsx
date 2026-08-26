import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { startThemeSync } from "./lib/theme";

/*
  밝기 버튼이 설정 화면 안으로 들어갔다. 그 버튼이 들고 있던 "OS 를 따라간다" 는
  일은 화면과 상관없이 계속 돌아야 해서 여기로 올린다 — React 밖이라 어느 탭을
  보고 있든 살아 있다. 첫 페인트는 index.html 의 인라인 스크립트가 이미 맡았다.
*/
startThemeSync();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
