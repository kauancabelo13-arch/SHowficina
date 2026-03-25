// ============================================================
//  AutoPeças IA — Bot WhatsApp com Z-API + Claude
//  Versão completa com dropshipping e link de pagamento
// ============================================================

const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

// ── Variáveis de ambiente ─────────────────────────────────────
const {
  ANTHROPIC_API_KEY,    // Chave da API do Claude (console.anthropic.com)
  ZAPI_INSTANCE_ID,     // Instance ID da Z-API
  ZAPI_TOKEN,           // Token da Z-API
  ZAPI_CLIENT_TOKEN,    // Client Token da Z-API
  PAGAMENTO_URL,        // Link de pagamento (Mercado Pago, PagSeguro etc.)
  PORT = 3000,
} = process.env;

// URL base da Z-API
const ZAPI = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}`;

// ── Sessões por cliente ───────────────────────────────────────
// Guarda o histórico de conversa de cada número
const sessoes = {};

function getSessao(telefone) {
  if (!sessoes[telefone]) {
    sessoes[telefone] = {
      historico: [],
      pedidoPendente: null,
    };
  }
  return sessoes[telefone];
}

// ── Prompt do sistema ─────────────────────────────────────────
const SYSTEM_PROMPT = `Você é o assistente virtual da AutoPeças IA, especialista em peças automotivas para o mercado brasileiro, operando via dropshipping.

SEU OBJETIVO:
Ajudar o cliente a encontrar a peça certa para o carro dele e fechar a venda.

COMO ATENDER:
1. Cumprimente o cliente de forma simpática
2. Pergunte o modelo, ano e versão do carro se não informado
3. Identifique a peça necessária com nome técnico e código de referência
4. Informe preço, marca e prazo
5. Pergunte se o cliente quer fechar o pedido
6. Quando confirmar, gere o JSON do pedido

CATÁLOGO (substitua com seus fornecedores reais):
- Pastilha freio dianteira Honda Civic 2012-2016: R$89,90 | Frasle | PD1234
- Pastilha freio dianteira Toyota Corolla 2015-2020: R$94,90 | Frasle | PD5678
- Filtro de óleo Honda Civic 2012-2020: R$32,90 | Mahle | FO1111
- Filtro de óleo Toyota Corolla 2015-2020: R$34,90 | Mahle | FO4321
- Filtro de óleo VW Gol 1.0 2010-2020: R$28,90 | Mahle | FO2222
- Filtro de ar Ford Ka 2015-2020: R$29,90 | Fram | FA999
- Filtro de ar VW Gol 1.0 2010-2020: R$27,90 | Fram | FA888
- Correia dentada VW Gol 1.0 2010-2016: R$129,90 | Gates | CT876
- Correia dentada Fiat Uno 2010-2015: R$119,90 | Gates | CT543
- Amortecedor dianteiro Fiat Uno 2011-2015: R$189,90 | Cofap | AM5678
- Amortecedor dianteiro VW Gol 2010-2020: R$199,90 | Cofap | AM9012
- Vela de ignição Honda Civic 2012-2016: R$49,90 un | NGK | VI3344
- Bateria 60Ah (universal carros médios): R$389,90 | Moura | BA6000

VALORES E PRAZOS:
- Frete grátis para compras acima de R$150
- Frete R$19,90 para compras abaixo de R$150
- Prazo de entrega: 3 a 5 dias úteis
- Pagamento: PIX, cartão de crédito ou boleto

REGRAS IMPORTANTES:
- Sempre confirme modelo + ano + versão antes de indicar a peça
- Se a peça não estiver no catálogo, diga que vai verificar com o fornecedor
- Quando o cliente disser "quero", "confirmo", "pode fechar", "sim" após ver o preço:
  Responda SOMENTE o JSON abaixo, sem mais nada:
  {"acao":"pedido","peca":"[nome completo]","codigo":"[cod]","preco":[valor numerico],"marca":"[marca]"}
- Nunca invente preços. Se não souber, diga que vai verificar
- Seja simpático, use emojis com moderação
- Responda sempre em português brasileiro`;

// ── Chamar a API do Claude ────────────────────────────────────
async function chamarClaude(telefone, mensagem) {
  const sessao = getSessao(telefone);

  // Adiciona mensagem do usuário ao histórico
  sessao.historico.push({ role: "user", content: mensagem });

  // Mantém apenas as últimas 20 mensagens (economiza tokens)
  if (sessao.historico.length > 20) {
    sessao.historico = sessao.historico.slice(-20);
  }

  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: sessao.historico,
    },
    {
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
    }
  );

  const resposta = response.data.content[0].text;

  // Salva resposta da IA no histórico
  sessao.historico.push({ role: "assistant", content: resposta });

  return resposta;
}

// ── Enviar mensagem de texto via Z-API ────────────────────────
async function enviarMensagem(telefone, texto) {
  await axios.post(
    `${ZAPI}/send-text`,
    { phone: telefone, message: texto },
    {
      headers: {
        "Client-Token": ZAPI_CLIENT_TOKEN,
        "Content-Type": "application/json",
      },
    }
  );
}

// ── Montar e enviar mensagem de pedido confirmado ─────────────
async function enviarPedido(telefone, pedido) {
  const frete = pedido.preco >= 150 ? 0 : 19.9;
  const total = (pedido.preco + frete).toFixed(2);

  // Link de pagamento com dados do pedido
  const ref = `${telefone}-${Date.now()}`;
  const linkPgto = PAGAMENTO_URL
    ? `${PAGAMENTO_URL}?ref=${ref}&valor=${total}`
    : null;

  const msg =
    `✅ *Pedido confirmado!*\n\n` +
    `🔧 *Peça:* ${pedido.peca}\n` +
    `🏷️ *Marca:* ${pedido.marca}\n` +
    `📋 *Código:* ${pedido.codigo}\n` +
    `💰 *Valor:* R$${pedido.preco.toFixed(2)}\n` +
    `🚚 *Frete:* ${frete === 0 ? "Grátis ✅" : "R$" + frete.toFixed(2)}\n` +
    `💳 *Total: R$${total}*\n\n` +
    `📦 *Prazo:* 3 a 5 dias úteis\n` +
    (linkPgto
      ? `\n👇 *Clique para pagar:*\n${linkPgto}\n`
      : `\n📲 *Formas de pagamento:* PIX, cartão ou boleto\nResponda aqui para finalizar!\n`) +
    `\n_Após confirmação do pagamento, enviaremos o rastreio._`;

  await enviarMensagem(telefone, msg);

  // Log do pedido no console (você pode integrar com banco de dados aqui)
  console.log(`\n💰 NOVO PEDIDO:`);
  console.log(`   Cliente: ${telefone}`);
  console.log(`   Peça: ${pedido.peca} (${pedido.codigo})`);
  console.log(`   Total: R$${total}`);
  console.log(`   Ref: ${ref}\n`);
}

// ── Processar mensagem recebida ───────────────────────────────
async function processarMensagem(telefone, texto) {
  try {
    console.log(`🤖 Chamando Claude para [${telefone}]...`);
    const resposta = await chamarClaude(telefone, texto);
    console.log(`✅ Claude respondeu: ${resposta.substring(0, 80)}...`);

    // Verifica se a IA gerou um JSON de pedido
    const jsonMatch = resposta.match(/\{[^{}]*"acao"\s*:\s*"pedido"[^{}]*\}/);

    if (jsonMatch) {
      try {
        const pedido = JSON.parse(jsonMatch[0]);
        await enviarPedido(telefone, pedido);
      } catch {
        await enviarMensagem(telefone, resposta);
      }
      return;
    }

    console.log(`📤 Enviando resposta para [${telefone}] via Z-API...`);
    await enviarMensagem(telefone, resposta);
    console.log(`✅ Resposta enviada com sucesso para [${telefone}]`);

  } catch (erro) {
    console.error(`❌ Erro ao processar [${telefone}]:`, erro.message);
    if (erro.response) {
      console.error(`   Status HTTP: ${erro.response.status}`);
      console.error(`   Resposta: ${JSON.stringify(erro.response.data)}`);
    }
    try {
      await enviarMensagem(
        telefone,
        "⚠️ Tive um pequeno problema técnico. Pode repetir sua mensagem?"
      );
    } catch (e2) {
      console.error(`❌ Falha também ao enviar mensagem de erro:`, e2.message);
    }
  }
}

// ── Rota: Webhook (Z-API envia mensagens aqui) ────────────────
app.post("/webhook", async (req, res) => {
  // Responde 200 imediatamente para a Z-API não reenviar
  res.sendStatus(200);

  try {
    const body = req.body;

    // Ignora mensagens enviadas pelo próprio bot
    if (body.fromMe === true) return;

    // Ignora mensagens de grupos
    if (body.isGroup === true) return;

    // Só processa mensagens de texto
    const texto =
      body.text?.message ||
      body.text?.body ||
      null;

    if (!texto) return;

    const telefone = body.phone;
    if (!telefone) return;

    console.log(`📩 [${telefone}]: ${texto}`);

    // Processa de forma assíncrona
    processarMensagem(telefone, texto);

  } catch (erro) {
    console.error("❌ Erro no webhook:", erro.message);
  }
});

// ── Rota: Health check ────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status: "✅ online",
    servico: "AutoPeças IA",
    integracao: "Z-API + Claude",
    versao: "3.0.0",
  });
});

// ── Iniciar servidor ──────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 AutoPeças IA iniciado na porta ${PORT}`);
  console.log(`📡 Webhook URL: /webhook`);
  console.log(`🔧 Z-API Instance: ${ZAPI_INSTANCE_ID || "não configurado"}\n`);
});
