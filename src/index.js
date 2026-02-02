import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import { AuthProvider } from "./context/AuthContext";

const shouldIgnoreAbortError = (value) => {
  if (!value) return false;
  const message =
    typeof value === "string"
      ? value
      : value.message || value.error?.message || value.toString?.() || "";
  return String(message).toLowerCase().includes("aborted a request");
};

window.addEventListener("unhandledrejection", (event) => {
  if (shouldIgnoreAbortError(event.reason)) {
    event.preventDefault();
  }
});

window.addEventListener("error", (event) => {
  if (shouldIgnoreAbortError(event.error || event.message)) {
    event.preventDefault();
  }
});

window.onunhandledrejection = (event) => {
  if (shouldIgnoreAbortError(event.reason)) {
    event.preventDefault();
    return true;
  }
  return false;
};

window.onerror = (message, source, lineno, colno, error) => {
  if (shouldIgnoreAbortError(error || message)) {
    return true;
  }
  return false;
};

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <AuthProvider>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </AuthProvider>
);

reportWebVitals();
