import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProveedorSesion, useSesion } from './sesion';
import { Estructura, SoloPara } from './componentes/Estructura';
import Login from './pantallas/Login';
import Inicio from './pantallas/Inicio';
import Ingreso from './pantallas/Ingreso';
import Deposito from './pantallas/Deposito';
import Historial from './pantallas/Historial';
import Actividades from './pantallas/Actividades';
import Gestion from './pantallas/Gestion';

function Rutas() {
  const { usuario } = useSesion();
  if (!usuario) return <Login />;

  return (
    <Routes>
      <Route element={<Estructura />}>
        <Route index element={<Inicio />} />
        <Route path="ingreso" element={
          <SoloPara pantalla="ingreso" titulo="Ingresar una donación"><Ingreso /></SoloPara>} />
        <Route path="deposito" element={
          <SoloPara pantalla="deposito" titulo="Depósito central"><Deposito /></SoloPara>} />
        <Route path="deposito/historial" element={
          <SoloPara pantalla="deposito" titulo="Movimientos"><Historial /></SoloPara>} />
        <Route path="actividades/*" element={
          <SoloPara pantalla="actividades" titulo="Actividades"><Actividades /></SoloPara>} />
        <Route path="gestion/*" element={
          <SoloPara pantalla="gestion" titulo="Gestión"><Gestion /></SoloPara>} />
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
