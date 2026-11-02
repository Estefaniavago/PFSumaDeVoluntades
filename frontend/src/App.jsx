import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProveedorSesion, useSesion } from './sesion';
import { Estructura, SoloPara } from './componentes/Estructura';
import Login from './pantallas/Login';
import Inicio from './pantallas/Inicio';

// Pantallas que todavía no están desarrolladas
function EnConstruccion({ titulo }) {
  return (
    <>
      <h2>{titulo}</h2>
      <div className="bloqueado"><strong>En construcción</strong>Esta pantalla se suma en las próximas entregas.</div>
    </>
  );
}

function Rutas() {
  const { usuario } = useSesion();
  if (!usuario) return <Login />;

  return (
    <Routes>
      <Route element={<Estructura />}>
        <Route index element={<Inicio />} />
        <Route path="ingreso" element={
          <SoloPara pantalla="ingreso" titulo="Ingresar una donación"><EnConstruccion titulo="Ingresar una donación" /></SoloPara>} />
        <Route path="deposito" element={
          <SoloPara pantalla="deposito" titulo="Depósito central"><EnConstruccion titulo="Depósito central" /></SoloPara>} />
        <Route path="actividades/*" element={
          <SoloPara pantalla="actividades" titulo="Actividades"><EnConstruccion titulo="Actividades" /></SoloPara>} />
        <Route path="gestion/*" element={
          <SoloPara pantalla="gestion" titulo="Gestión"><EnConstruccion titulo="Gestión" /></SoloPara>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ProveedorSesion>
      <BrowserRouter>
        <Rutas />
      </BrowserRouter>
    </ProveedorSesion>
  );
}
