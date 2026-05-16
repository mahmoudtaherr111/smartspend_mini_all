import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

window.onerror = function (msg, url, line, col, error) {
  const div = document.createElement("div");
  div.style.color = "#b91c1c";
  div.style.padding = "20px";
  div.style.background = "#fff7ed";
  div.style.position = "fixed";
  div.style.top = "0";
  div.style.zIndex = "9999";
  div.style.maxWidth = "100%";
  div.style.boxSizing = "border-box";
  div.style.fontFamily = "system-ui, sans-serif";

  const title = document.createElement("h1");
  title.textContent = "Runtime Error";
  title.style.fontSize = "18px";
  title.style.marginBottom = "8px";

  const p1 = document.createElement("p");
  p1.textContent = String(msg);

  const p2 = document.createElement("p");
  p2.style.fontSize = "12px";
  p2.style.opacity = "0.8";
  p2.textContent = `at ${url}:${line}:${col}`;

  const pre = document.createElement("pre");
  pre.style.whiteSpace = "pre-wrap";
  pre.style.fontSize = "11px";
  pre.textContent = error?.stack || "";

  div.appendChild(title);
  div.appendChild(p1);
  div.appendChild(p2);
  div.appendChild(pre);
  document.body.appendChild(div);
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
