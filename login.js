async function login(userType) {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const message = document.getElementById('message');

  // Validação de campos vazios
  if (!email || !password) {
    message.textContent = 'Por favor, preencha todos os campos.';
    message.style.display = 'block';
    return;
  }

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      message.textContent = data.error || 'Erro ao fazer login.';
      message.style.display = 'block';
      return;
    }

    if (data.userType === 'restaurant') {
      window.location.href = '/dashboard.html';
    } else if (data.userType === 'client') {
      window.location.href = '/client_dashboard.html';
    }
  } catch (error) {
    message.textContent = 'Erro ao conectar ao servidor.';
    message.style.display = 'block';
    console.error('Erro no login:', error);
  }
}