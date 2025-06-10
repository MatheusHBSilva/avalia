require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const PDFDocument = require('pdfkit');

const app = express();
const port = 3000;

// Middleware
app.use(cors({ origin: ['https://sua-app.render.com', 'http://localhost:3000'], credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// Banco de dados
const db = new sqlite3.Database('database.db');

// Criação de tabelas
db.run(`
  CREATE TABLE IF NOT EXISTS restaurants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_name TEXT NOT NULL,
    cnpj TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    tags TEXT,
    created_at TEXT NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    sobrenome TEXT NOT NULL,
    cpf TEXT NOT NULL UNIQUE,
    telefone TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    senha TEXT NOT NULL,
    tags TEXT,
    created_at TEXT NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS favoritos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    restaurant_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
    UNIQUE(client_id, restaurant_id)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL,
    reviewer_name TEXT NOT NULL,
    rating INTEGER NOT NULL,
    review_text TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL,
    analysis TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
  )
`);

// Registro de Restaurantes
app.post('/api/register', async (req, res) => {
  const { restaurantName, cnpj, email, password, tags } = req.body;

  if (!restaurantName || !cnpj || !email || !password) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }

  try {
    const existingUser = await new Promise((resolve, reject) => {
      db.get('SELECT email FROM restaurants WHERE email = ?', [email], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Este email já está registrado.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO restaurants (restaurant_name, cnpj, email, password, tags, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [restaurantName, cnpj, email, hashedPassword, tags || '', new Date().toISOString()],
        (err) => {
          if (err) reject(err);
          resolve();
        }
      );
    });

    res.status(201).json({ message: 'Registro salvo com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// Registro de Clientes
app.post('/api/register-client', async (req, res) => {
  const { nome, sobrenome, cpf, telefone, email, senha, tags } = req.body;

  if (!nome || !sobrenome || !cpf || !telefone || !email || !senha) {
    return res.status(400).json({ error: 'Todos os campos obrigatórios são obrigatórios.' });
  }

  try {
    const existingClient = await new Promise((resolve, reject) => {
      db.get('SELECT email FROM clients WHERE email = ? OR cpf = ?', [email, cpf], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });

    if (existingClient) {
      return res.status(400).json({ error: 'Este email ou CPF já está registrado.' });
    }

    const hashedPassword = await bcrypt.hash(senha, 10);
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO clients (nome, sobrenome, cpf, telefone, email, senha, tags, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [nome, sobrenome, cpf, telefone, email, hashedPassword, tags || '', new Date().toISOString()],
        (err) => {
          if (err) reject(err);
          resolve();
        }
      );
    });

    res.status(201).json({ message: 'Cadastro salvo com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
  }

  try {
    let user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM restaurants WHERE email = ?', [email], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });
    if (user) {
      const passwordMatch = await bcrypt.compare(password, user.password);
      if (passwordMatch) {
        res.cookie('restaurantId', user.id, { httpOnly: true, sameSite: 'Lax', maxAge: 24 * 60 * 60 * 1000 });
        return res.status(200).json({ message: 'Login realizado com sucesso!', userType: 'restaurant', redirect: '/dashboard.html' });
      }
    }

    user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM clients WHERE email = ?', [email], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });
    if (user) {
      const passwordMatch = await bcrypt.compare(password, user.senha);
      if (passwordMatch) {
        res.cookie('clientId', user.id, { httpOnly: true, sameSite: 'Lax', maxAge: 24 * 60 * 60 * 1000 });
        return res.status(200).json({ message: 'Login realizado com sucesso!', userType: 'client', redirect: '/client_dashboard.html' });
      }
    }

    return res.status(401).json({ error: 'Email ou senha incorretos.' });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  res.clearCookie('clientId');
  res.clearCookie('restaurantId');
  res.status(200).json({ message: 'Logout realizado com sucesso!' });
});

// Dados do restaurante logado
app.get('/api/me', (req, res) => {
  const restaurantId = req.cookies.restaurantId;
  if (!restaurantId) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  db.get('SELECT id, restaurant_name, tags FROM restaurants WHERE id = ?', [restaurantId], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Erro interno no servidor.' });
    }

    if (!row) {
      return res.status(404).json({ error: 'Restaurante não encontrado.' });
    }

    res.json({
      restaurantId: row.id,
      restaurantName: row.restaurant_name,
      tags: row.tags ? row.tags.split(',').map(tag => tag.trim()) : []
    });
  });
});

// Dados do cliente logado
app.get('/api/client-me', (req, res) => {
  const clientId = req.cookies.clientId;
  if (!clientId) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  db.get('SELECT id, nome, sobrenome, email, tags FROM clients WHERE id = ?', [clientId], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Erro interno no servidor.' });
    }

    if (!row) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    res.json({ clientId: row.id, nome: row.nome, sobrenome: row.sobrenome, email: row.email, tags: row.tags ? row.tags.split(',').map(tag => tag.trim()) : [] });
  });
});

// Obter restaurantes por ID, busca ou aleatórios com média de avaliações e contagem
app.get('/api/restaurants', (req, res) => {
  const { id, limit, random, search } = req.query;

  let query = `
    SELECT r.id, r.restaurant_name, 
           COALESCE(AVG(rev.rating), 0) as average_rating,
           COUNT(rev.rating) as review_count
    FROM restaurants r
    LEFT JOIN reviews rev ON r.id = rev.restaurant_id
  `;
  const params = [];

  if (id) {
    query += ' WHERE r.id = ?';
    params.push(id);
  } else if (search) {
    query += ' WHERE r.restaurant_name LIKE ?';
    params.push(`%${search}%`);
  }

  query += ' GROUP BY r.id, r.restaurant_name';

  if (random && !search) {
    query += ' ORDER BY RANDOM()';
  }

  if (limit) {
    query += ' LIMIT ?';
    params.push(parseInt(limit));
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Erro interno no servidor.' });
    }

    if (rows.length === 0 && id) {
      return res.status(404).json({ error: 'Restaurante não encontrado.' });
    }

    res.json({ restaurants: rows.map(row => ({
      id: row.id,
      restaurant_name: row.restaurant_name,
      average_rating: parseFloat(row.average_rating.toFixed(1)),
      review_count: row.review_count
    })) });
  });
});

// Obter tags do restaurante
app.get('/api/restaurant-tags', (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'ID do restaurante é obrigatório.' });
  }

  db.get('SELECT tags FROM restaurants WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Erro interno no servidor.' });
    }

    if (!row) {
      return res.status(404).json({ error: 'Restaurante não encontrado.' });
    }

    const tags = row.tags ? row.tags.split(',').map(tag => tag.trim()) : [];
    res.json({ tags });
  });
});

// Obter restaurantes favoritados pelo cliente
app.get('/api/favorites/restaurants', (req, res) => {
  const clientId = req.cookies.clientId;
  if (!clientId) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  const query = `
    SELECT r.id, r.restaurant_name, 
           COALESCE(AVG(rev.rating), 0) as average_rating,
           COUNT(rev.rating) as review_count
    FROM restaurants r
    LEFT JOIN reviews rev ON r.id = rev.restaurant_id
    INNER JOIN favoritos f ON r.id = f.restaurant_id
    WHERE f.client_id = ?
    GROUP BY r.id, r.restaurant_name
  `;

  db.all(query, [clientId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Erro interno no servidor.' });
    }

    res.json({ restaurants: rows.map(row => ({
      id: row.id,
      restaurant_name: row.restaurant_name,
      average_rating: parseFloat(row.average_rating.toFixed(1)),
      review_count: row.review_count
    })) });
  });
});

// Obter avaliações de um restaurante
app.get('/api/reviews', (req, res) => {
  const { restaurantId, limit } = req.query;

  if (!restaurantId) {
    return res.status(400).json({ error: 'ID do restaurante é obrigatório.' });
  }

  const queryLimit = limit ? parseInt(limit) : 50;
  db.all(
    'SELECT reviewer_name, rating, review_text, created_at FROM reviews WHERE restaurant_id = ? ORDER BY created_at DESC LIMIT ?',
    [restaurantId, queryLimit],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Erro interno no servidor.' });
      }

      res.json({ reviews: rows });
    }
  );
});

// Gerenciar favoritos
app.get('/api/favorites', (req, res) => {
  const clientId = req.cookies.clientId;
  if (!clientId) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  db.all(
    'SELECT restaurant_id FROM favoritos WHERE client_id = ?',
    [clientId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Erro interno no servidor.' });
    }

    res.json({ favorites: rows });
  });
});

app.post('/api/favorites', async (req, res) => {
  const clientId = req.cookies.clientId;
  const { restaurantId, action } = req.body;

  if (!clientId) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  if (!restaurantId || !action) {
    return res.status(400).json({ error: 'ID do restaurante e ação são obrigatórios.' });
  }

  try {
    if (action === 'add') {
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO favoritos (client_id, restaurant_id, created_at) VALUES (?, ?, ?)',
          [clientId, restaurantId, new Date().toISOString()],
          (err) => {
            if (err) reject(err);
            resolve();
          }
        );
      });
      res.status(201).json({ message: 'Restaurante adicionado aos favoritos!' });
    } else if (action === 'remove') {
      await new Promise((resolve, reject) => {
        db.run(
          'DELETE FROM favoritos WHERE client_id = ? AND restaurant_id = ?',
          [clientId, restaurantId],
          (err) => {
            if (err) reject(err);
            resolve();
          }
        );
      });
      res.status(200).json({ message: 'Restaurante removido dos favoritos!' });
    } else {
      res.status(400).json({ error: 'Ação inválida.' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// Gerar análise de negócio com Gemini API (para o restaurante)
app.post('/api/business-analysis', async (req, res) => {
  const { restaurantId, format } = req.body;

  if (!restaurantId) {
    return res.status(400).json({ error: 'ID do restaurante é obrigatório.' });
  }

  try {
    const reviews = await new Promise((resolve, reject) => {
      db.all(
        'SELECT reviewer_name, rating, review_text, created_at FROM reviews WHERE restaurant_id = ? ORDER BY created_at DESC LIMIT 50',
        [restaurantId],
        (err, rows) => {
          if (err) reject(err);
          resolve(rows);
        }
      );
    });

    const prompt = `
      Analise as seguintes avaliações de um restaurante, incluindo o texto e a nota em estrelas (de 1 a 5). Forneça um relatório detalhado que inclua:
      1. Análise de sentimento de forma geral (não precisa ser avaliação por avaliação).
      2. Resumo das tendências gerais (por exemplo, pontos fortes e fracos mencionados).
      3. Sugestões de melhorias com base nas avaliações.
      4. Média geral das notas e uma visão geral do desempenho do restaurante.
      5. Não avalie individualmente, faça um resumo geral bem estruturado.
      6. Deixe tudo em forma profissional.
      Segue as avaliações:
      ${reviews.map((r, i) => `Avaliação ${i + 1}: "${r.review_text || 'Sem comentário'}" (${r.rating} estrelas)`).join('\n')}
    `;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Chave da API do Gemini não configurada no arquivo .env.');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

    const result = await model.generateContent(prompt);
    const analysis = result.response.text();

    // Salvar o relatório no banco de dados
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO reports (restaurant_id, analysis, created_at) VALUES (?, ?, ?)',
        [restaurantId, analysis, new Date().toISOString()],
        (err) => {
          if (err) reject(err);
          resolve();
        }
      );
    });

    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 50 });
      let buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="relatorio_analise_${restaurantId}.pdf"`);
        res.send(pdfData);
      });

      doc.fontSize(16).text('Relatório de Análise de Negócio', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Restaurante ID: ${restaurantId}`);
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`);
      doc.moveDown();
      doc.text(analysis, { align: 'left', lineGap: 2 });
      doc.end();
    } else {
      res.status(200).json({ analysis });
    }
  } catch (error) {
    res.status(500).json({ error: error.message || 'Erro interno ao gerar análise.' });
  }
});

// Gerar recomendação personalizada para o cliente com Gemini API
app.post('/api/client-recommendation', async (req, res) => {
  const { restaurantId, format } = req.body;

  if (!restaurantId) {
    return res.status(400).json({ error: 'ID do restaurante é obrigatório.' });
  }

  try {
    const clientId = req.cookies.clientId;
    if (!clientId) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    // Obter avaliações dos últimos 100 clientes
    const reviews = await new Promise((resolve, reject) => {
      db.all(
        'SELECT reviewer_name, rating, review_text FROM reviews WHERE restaurant_id = ? ORDER BY created_at DESC LIMIT 100',
        [restaurantId],
        (err, rows) => {
          if (err) reject(err);
          resolve(rows);
        }
      );
    });

    // Obter tags do restaurante
    const restaurant = await new Promise((resolve, reject) => {
      db.get('SELECT tags FROM restaurants WHERE id = ?', [restaurantId], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });
    const restaurantTags = restaurant ? restaurant.tags.split(',').map(tag => tag.trim()) : [];

    // Obter tags do cliente
    const client = await new Promise((resolve, reject) => {
      db.get('SELECT tags FROM clients WHERE id = ?', [clientId], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });
    const clientTags = client ? client.tags.split(',').map(tag => tag.trim()) : [];

    const reviewTexts = reviews.map(r => `${r.reviewer_name} (${r.rating} estrelas): "${r.review_text || 'Sem comentário'}"`).join('\n');
    const prompt = `
      Analise as seguintes avaliações de um restaurante, incluindo texto e nota em estrelas (1 a 5), junto com as tags do restaurante (${restaurantTags.join(', ')}) e do cliente (${clientTags.join(', ')}). Forneça um relatório que:
      1. Avalie se o restaurante é recomendável para o cliente com base nas avaliações e nas tags fornecidas.
      2. Resuma as tendências gerais (pontos fortes e fracos).
      3. Forneça uma recomendação clara (sim/não) e justifique.
      4. Faça isso tudo em no máximo 5 linhas
      5. Caso tenha nenhuma avaliaão apenas responda "Restaurante não avalidado", não precisa falar mais nada.
      Segue as avaliações:
      ${reviewTexts}
    `;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Chave da API do Gemini não configurada no arquivo .env.');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

    const result = await model.generateContent(prompt);
    const analysis = result.response.text();

    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 50 });
      let buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="recomendacao_${restaurantId}.pdf"`);
        res.send(pdfData);
      });

      doc.fontSize(16).text('Relatório de Recomendação', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Restaurante ID: ${restaurantId}`);
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`);
      doc.moveDown();
      doc.text(analysis, { align: 'left', lineGap: 2 });
      doc.end();
    } else {
      res.status(200).json({ analysis });
    }
  } catch (error) {
    res.status(500).json({ error: error.message || 'Erro interno ao gerar recomendação.' });
  }
});

// Submeter avaliação
app.post('/api/reviews', async (req, res) => {
  const { restaurantId, reviewerName, rating, reviewText } = req.body;

  if (!restaurantId || !reviewerName || !rating) {
    return res.status(400).json({ error: 'Restaurante, nome e nota são obrigatórios.' });
  }

  if (rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'A nota deve ser entre 1 e 5.' });
  }

  try {
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO reviews (restaurant_id, reviewer_name, rating, review_text, created_at) VALUES (?, ?, ?, ?, ?)',
        [restaurantId, reviewerName, rating, reviewText || '', new Date().toISOString()],
        (err) => {
          if (err) reject(err);
          resolve();
        }
      );
    });

    res.status(201).json({ message: 'Avaliação salva com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// Obter histórico de relatórios
app.get('/api/report-history', (req, res) => {
  const { restaurantId } = req.query;

  if (!restaurantId) {
    return res.status(400).json({ error: 'ID do restaurante é obrigatório.' });
  }

  db.all(
    'SELECT id, created_at AS date FROM reports WHERE restaurant_id = ? ORDER BY created_at DESC LIMIT 10',
    [restaurantId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Erro interno no servidor.' });
      }

      res.json({ reports: rows });
    }
  );
});

// Baixar relatório como PDF
app.post('/api/download-report', async (req, res) => {
  const { reportId } = req.body;

  if (!reportId) {
    return res.status(400).json({ error: 'ID do relatório é obrigatório.' });
  }

  try {
    const report = await new Promise((resolve, reject) => {
      db.get(
        'SELECT restaurant_id, analysis, created_at FROM reports WHERE id = ?',
        [reportId],
        (err, row) => {
          if (err) reject(err);
          resolve(row);
        }
      );
    });

    if (!report) {
      return res.status(404).json({ error: 'Relatório não encontrado.' });
    }

    const doc = new PDFDocument({ margin: 50 });
    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="relatorio_${report.created_at.replace(/:/g, '-').replace(/ /g, '_')}.pdf"`);
      res.send(pdfData);
    });

    doc.fontSize(16).text('Relatório de Análise de Negócio', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Restaurante ID: ${report.restaurant_id}`);
    doc.text(`Gerado em: ${new Date(report.created_at).toLocaleString('pt-BR')}`);
    doc.moveDown();
    doc.text(report.analysis, { align: 'left', lineGap: 2 });
    doc.end();
  } catch (error) {
    res.status(500).json({ error: 'Erro interno ao baixar relatório.' });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});