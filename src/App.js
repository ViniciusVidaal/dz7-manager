import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import Login from "./pages/Login";
import FirstAccess from "./pages/FirstAccess";
import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
import Clients from "./pages/Clients";
import Finance from "./pages/Finance";
import Tools from "./pages/Tools";
import Investments from "./pages/Investments";
import Approvals from "./pages/Approvals";
import Users from "./pages/Users";
import Payroll from "./pages/Payroll";
import Goals from "./pages/Goals";
import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/primeiro-acesso" element={<FirstAccess />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/leads"
        element={
          <ProtectedRoute>
            <Leads />
          </ProtectedRoute>
        }
      />
      <Route
        path="/clientes"
        element={
          <ProtectedRoute>
            <Clients />
          </ProtectedRoute>
        }
      />
      <Route
        path="/investimentos"
        element={
          <ProtectedRoute>
            <Investments />
          </ProtectedRoute>
        }
      />
      <Route
        path="/financeiro"
        element={
          <ProtectedRoute>
            <Finance />
          </ProtectedRoute>
        }
      />
      <Route
        path="/metas"
        element={
          <ProtectedRoute>
            <Goals />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ferramentas"
        element={
          <ProtectedRoute>
            <Tools />
          </ProtectedRoute>
        }
      />
      <Route
        path="/aprovacoes"
        element={
          <ProtectedRoute>
            <Approvals />
          </ProtectedRoute>
        }
      />
      <Route
        path="/usuarios"
        element={
          <ProtectedRoute>
            <Users />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pagamentos"
        element={
          <ProtectedRoute>
            <Payroll />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
