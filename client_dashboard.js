let currentMode = 'all'; // 'all', 'favorites', ou 'search'
let currentSearchQuery = '';

function updateDisplay() {
  const searchContainer = document.getElementById('search-container');
  const searchBar = document.querySelector('.search-bar');
  const favoritesMode = document.createElement('div');
  favoritesMode.className = 'favorites-mode';
  favoritesMode.innerHTML = `
    <div class="favorites-title">Favoritos</div>
    <button class="back-button" onclick="showAllRestaurants()">Voltar</button>
  `;

  if (currentMode === 'favorites') {
    if (!searchContainer.querySelector('.favorites-mode')) {
      searchContainer.innerHTML = '';
      searchContainer.appendChild(favoritesMode);
      favoritesMode.classList.add('show');
    }
  } else {
    if (searchContainer.querySelector('.favorites-mode')) {
      searchContainer.innerHTML = '';
    }
    if (!searchContainer.querySelector('.search-bar')) {
      searchContainer.innerHTML = '<div class="search-bar"><input type="text" id="search-input" placeholder="Pesquisar restaurantes..." oninput="searchRestaurants()"></div>';
    }
  }
}

async function loadRestaurants() {
  try {
    const restaurantList = document.getElementById('restaurant-list');
    restaurantList.innerHTML = ''; // Limpar lista atual

    // Carregar favoritos do cliente
    const favoritesResponse = await fetch('/api/favorites', { credentials: 'include' });
    const favoritesData = await favoritesResponse.json();
    const favorites = new Set(favoritesData.favorites.map(f => f.restaurant_id));

    let url = '/api/restaurants';
    if (currentMode === 'favorites') {
      url = '/api/favorites/restaurants';
    } else if (currentMode === 'search' && currentSearchQuery) {
      url = `/api/restaurants?search=${encodeURIComponent(currentSearchQuery)}`;
    } else {
      url = '/api/restaurants?limit=5&random=true';
    }

    const response = await fetch(url, { credentials: 'include' });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Erro ao carregar restaurantes.');
    }

    data.restaurants.forEach(restaurant => {
      const restaurantCard = document.createElement('div');
      restaurantCard.classList.add('restaurant-card');
      restaurantCard.innerHTML = `
        <div class="restaurant-info">
          <div class="restaurant-name">${restaurant.restaurant_name}</div>
          <div class="restaurant-rating">⭐ ${restaurant.average_rating} (${restaurant.review_count} avaliações)</div>
        </div>
        <span class="heart-icon ${favorites.has(restaurant.id) ? 'favorite' : ''}" data-id="${restaurant.id}"></span>
      `;

      // Adicionar evento de clique para redirecionar ao clicar no card
      restaurantCard.addEventListener('click', (e) => {
        if (e.target.classList.contains('heart-icon')) return;
        window.location.href = `/review.html?id=${restaurant.id}`;
      });

      // Adicionar evento de clique no coração
      const heartIcon = restaurantCard.querySelector('.heart-icon');
      heartIcon.addEventListener('click', async (e) => {
        e.stopPropagation();
        const restaurantId = heartIcon.getAttribute('data-id');
        const isFavorite = heartIcon.classList.contains('favorite');

        try {
          const action = isFavorite ? 'remove' : 'add';
          const favResponse = await fetch('/api/favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ restaurantId, action }),
            credentials: 'include'
          });

          const favData = await favResponse.json();
          if (favResponse.ok) {
            heartIcon.classList.toggle('favorite');
            if (currentMode === 'favorites') {
              loadRestaurants(); // Recarregar para atualizar a lista de favoritos
            }
          } else {
            alert(favData.error || 'Erro ao atualizar favorito.');
          }
        } catch (error) {
          console.error('Erro ao atualizar favorito:', error);
          alert('Erro ao conectar ao servidor.');
        }
      });

      restaurantList.appendChild(restaurantCard);
    });
  } catch (error) {
    console.error('Erro ao carregar restaurantes:', error);
    alert('Erro ao carregar restaurantes.');
  }
}

async function loadClientDashboard() {
  try {
    // Carregar informações do cliente logado
    const clientResponse = await fetch('/api/client-me', { credentials: 'include' });
    const clientData = await clientResponse.json();
    if (!clientResponse.ok) {
      window.location.href = '/login_client.html';
      return;
    }

    // Preencher o nome do cliente no dropdown
    document.getElementById('client-name').textContent = clientData.nome;

    // Carregar restaurantes iniciais
    loadRestaurants();
  } catch (error) {
    console.error('Erro ao carregar dashboard:', error);
    window.location.href = '/login_client.html';
  }
}

function toggleDropdown() {
  const dropdown = document.getElementById('dropdown');
  dropdown.classList.toggle('show');
}

async function showFavorites() {
  currentMode = 'favorites';
  currentSearchQuery = '';
  await loadRestaurants();
  updateDisplay();
  toggleDropdown(); // Fechar dropdown após clicar
}

async function showAllRestaurants() {
  currentMode = 'all'; // Resetar o modo para 'all'
  currentSearchQuery = ''; // Limpar a query de busca
  const searchContainer = document.getElementById('search-container');
  searchContainer.innerHTML = '<div class="search-bar"><input type="text" id="search-input" placeholder="Pesquisar restaurantes..." oninput="searchRestaurants()"></div>';
  await loadRestaurants();
}

async function searchRestaurants() {
  const searchInput = document.getElementById('search-input');
  if (!searchInput) return; // Evitar busca se a barra de pesquisa não estiver presente
  const query = searchInput.value.trim();
  currentSearchQuery = query;
  currentMode = query ? 'search' : 'all';
  await loadRestaurants();
}

async function logout() {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login_client.html';
  } catch (error) {
    console.error('Erro ao fazer logout:', error);
    window.location.href = '/login_client.html';
  }
}

// Fechar dropdown ao clicar fora
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('dropdown');
  const profilePic = document.querySelector('.profile-pic');
  if (!profilePic.contains(e.target)) {
    dropdown.classList.remove('show');
  }
});

document.addEventListener('DOMContentLoaded', loadClientDashboard);