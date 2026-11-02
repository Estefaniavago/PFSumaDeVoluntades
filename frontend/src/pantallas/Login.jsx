import { useState } from 'react';
import { useSesion } from '../sesion';

export default function Login() {
  const { iniciarSesion } = useSesion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Completá el email y la contraseña.');
      return;
    }
    setEnviando(true);
    try {
      await iniciarSesion(email.trim(), password);
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <div className="login">
      <form className="tarjeta" onSubmit={enviar} noValidate>
        <img src="/logo.png" alt="Suma de Voluntades" />
        <div className="nombre-app">Gestión de donaciones</div>
        <h2>Iniciar sesión</h2>

        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="username" value={email}
               onChange={e => setEmail(e.target.value)} />

        <label htmlFor="password">Contraseña</label>
        <input id="password" type="password" autoComplete="current-password" value={password}
               onChange={e => setPassword(e.target.value)} />

        {error && <div className="mensaje-error" role="alert">{error}</div>}

        <button className="boton" type="submit" disabled={enviando}>
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
