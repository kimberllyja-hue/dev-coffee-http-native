const http = require('node:http');
const { URL } = require('node:url');

const PORT = 3000;
const ALLOWED_STATUSES = ['pendente', 'pronto', 'cancelado'];

// Armazenamento em memória dos pedidos e contador sequencial de ID
let orders = [];
let nextId = 1;

/**
 * Envia uma resposta JSON padronizada com charset UTF-8.
 */
function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(payload));
}

/**
 * Envia uma resposta 204 No Content sem corpo.
 */
function sendNoContent(res) {
  res.writeHead(204);
  res.end();
}

/**
 * Lê e faz o parse do corpo (body) da requisição via eventos de stream.
 */
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', (chunk) => {
      chunks.push(chunk);
    });

    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf-8').trim();

      if (!rawBody) {
        return reject(new Error('O corpo da requisição (body) não pode estar vazio.'));
      }

      try {
        const parsed = JSON.parse(rawBody);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return reject(new Error('O corpo da requisição deve ser um objeto JSON válido.'));
        }
        resolve(parsed);
      } catch {
        reject(new Error('JSON malformado no corpo da requisição.'));
      }
    });

    req.on('error', () => {
      reject(new Error('Erro ao ler o stream da requisição.'));
    });
  });
}

/**
 * Valida e converte o :id da URL para um número inteiro positivo.
 */
function parseOrderId(rawId) {
  if (!/^\d+$/.test(rawId)) {
    return null;
  }
  const id = Number(rawId);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const server = http.createServer(async (req, res) => {
  const method = req.method;
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:' + PORT}`);
  const pathname = parsedUrl.pathname;

  // GET /orders (com suporte opcional a ?status=...)
  if (method === 'GET' && pathname === '/orders') {
    const statusFilter = parsedUrl.searchParams.get('status');

    if (statusFilter !== null) {
      if (!ALLOWED_STATUSES.includes(statusFilter)) {
        return sendJson(res, 400, {
          error: `Status inválido para filtro. Use um dos valores: ${ALLOWED_STATUSES.join(', ')}.`,
        });
      }
      const filteredOrders = orders.filter((order) => order.status === statusFilter);
      return sendJson(res, 200, filteredOrders);
    }

    return sendJson(res, 200, orders);
  }

  // POST /orders
  if (method === 'POST' && pathname === '/orders') {
    try {
      const body = await parseJsonBody(req);
      const client = typeof body.client === 'string' ? body.client.trim() : '';
      const item = typeof body.item === 'string' ? body.item.trim() : '';

      if (!client || !item) {
        return sendJson(res, 400, {
          error: 'Os campos obrigatórios "client" e "item" devem ser textos não vazios.',
        });
      }

      const newOrder = {
        id: nextId++,
        client,
        item,
        status: 'pendente',
      };

      orders.push(newOrder);
      return sendJson(res, 201, newOrder);
    } catch (err) {
      return sendJson(res, 400, {
        error: err.message,
      });
    }
  }

  // Rotas com /orders/:id/status
  const statusMatch = pathname.match(/^\/orders\/([^/]+)\/status$/);
  if (statusMatch) {
    if (method !== 'PATCH') {
      return sendJson(res, 404, {
        error: `Método ${method} não permitido para a rota ${pathname}.`,
      });
    }

    const orderId = parseOrderId(statusMatch[1]);
    if (!orderId) {
      return sendJson(res, 400, {
        error: 'O ID do pedido deve ser um número inteiro positivo.',
      });
    }

    const order = orders.find((item) => item.id === orderId);
    if (!order) {
      return sendJson(res, 404, {
        error: `Pedido com ID ${orderId} não encontrado.`,
      });
    }

    try {
      const body = await parseJsonBody(req);
      const newStatus = body.status;

      if (typeof newStatus !== 'string' || !ALLOWED_STATUSES.includes(newStatus)) {
        return sendJson(res, 400, {
          error: `Status inválido. Valores permitidos: ${ALLOWED_STATUSES.join(', ')}.`,
        });
      }

      order.status = newStatus;
      return sendJson(res, 200, order);
    } catch (err) {
      return sendJson(res, 400, {
        error: err.message,
      });
    }
  }

  // Rotas com /orders/:id (GET e DELETE)
  const orderMatch = pathname.match(/^\/orders\/([^/]+)$/);
  if (orderMatch) {
    const orderId = parseOrderId(orderMatch[1]);

    if (method === 'GET') {
      if (!orderId) {
        return sendJson(res, 404, {
          error: `Pedido com ID "${orderMatch[1]}" não encontrado.`,
        });
      }

      const order = orders.find((item) => item.id === orderId);
      if (!order) {
        return sendJson(res, 404, {
          error: `Pedido com ID ${orderId} não encontrado.`,
        });
      }

      return sendJson(res, 200, order);
    }

    if (method === 'DELETE') {
      if (!orderId) {
        return sendJson(res, 404, {
          error: `Pedido com ID "${orderMatch[1]}" não encontrado.`,
        });
      }

      const index = orders.findIndex((item) => item.id === orderId);
      if (index === -1) {
        return sendJson(res, 404, {
          error: `Pedido com ID ${orderId} não encontrado.`,
        });
      }

      orders.splice(index, 1);
      return sendNoContent(res);
    }

    return sendJson(res, 404, {
      error: `Método ${method} não suportado para ${pathname}.`,
    });
  }

  // Qualquer outra rota ou verbo HTTP não previsto
  return sendJson(res, 404, {
    error: `Rota não encontrada: ${method} ${pathname}`,
  });
});

server.listen(PORT, () => {
  console.log(`Dev Coffee API rodando em http://localhost:${PORT}`);
});