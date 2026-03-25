// ============================================================
//  AutoPeças IA — Diagnóstico de credenciais e conexões
//  Execute com: node diagnostico.js
// ============================================================

const axios = require("axios");

// ── Variáveis de ambiente ─────────────────────────────────────
const {
  ANTHROPIC_API_KEY,
  ZAPI_INSTANCE_ID,
  ZAPI_TOKEN,
  ZAPI_CLIENT_TOKEN,
  NUMERO_TESTE,
} = process.env;

const ZAPI_BASE = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}`;

// ── Helpers de output ─────────────────────────────────────────
const ok  = (msg) => console.log(`  ✅ ${msg}`);
const err = (msg) => console.log(`  ❌ ${msg}`);
const inf = (msg) => console.log(`  ℹ️  ${msg}`);
const sep = ()    => console.log("─".repeat(55));

// ── 1. Variáveis de ambiente ──────────────────────────────────
function testarVariaveis() {
  console.log("\n📋 [1/4] Variáveis de ambiente");
  sep();

  const vars = {
    ANTHROPIC_API_KEY,
    ZAPI_INSTANCE_ID,
    ZAPI_TOKEN,
    ZAPI_CLIENT_TOKEN,
  };

  let todasOk = true;

  for (const [nome, valor] of Object.entries(vars)) {
    if (valor) {
      const preview = valor.length > 8
        ? `${valor.slice(0, 4)}${"*".repeat(valor.length - 8)}${valor.slice(-4)}`
        : "****";
      ok(`${nome} = ${preview}`);
    } else {
      err(`${nome} — NÃO configurada`);
      todasOk = false;
    }
  }

  if (NUMERO_TESTE) {
    inf(`NUMERO_TESTE = ${NUMERO_TESTE} (teste de envio habilitado)`);
  } else {
    inf("NUMERO_TESTE não configurada — teste de envio será pulado");
  }

  return todasOk;
}

// ── 2. Claude API ─────────────────────────────────────────────
async function testarClaude() {
  console.log("\n🤖 [2/4] Claude API (Anthropic)");
  sep();

  if (!ANTHROPIC_API_KEY) {
    err("ANTHROPIC_API_KEY não configurada — teste ignorado");
    return false;
  }

  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 32,
        messages: [{ role: "user", content: "Responda apenas: OK" }],
      },
      {
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
      }
    );

    const texto = response.data?.content?.[0]?.text ?? "(sem texto)";
    ok(`Conexão bem-sucedida — HTTP ${response.status}`);
    ok(`Resposta do modelo: "${texto.trim()}"`);
    return true;

  } catch (e) {
    const status = e.response?.status;
    const detalhe = e.response?.data?.error?.message ?? e.message;
    err(`Falha na chamada — ${status ? `HTTP ${status}` : "sem resposta"}`);
    err(`Detalhe: ${detalhe}`);
    if (status === 401) inf("Verifique se ANTHROPIC_API_KEY está correta e ativa.");
    if (status === 429) inf("Limite de requisições atingido. Aguarde e tente novamente.");
    return false;
  }
}

// ── 3. Z-API — status da instância ───────────────────────────
async function testarZAPIStatus() {
  console.log("\n📡 [3/4] Z-API — status da instância");
  sep();

  if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN) {
    err("Credenciais Z-API incompletas — teste ignorado");
    return false;
  }

  try {
    const response = await axios.get(`${ZAPI_BASE}/status`, {
      headers: {
        "Client-Token": ZAPI_CLIENT_TOKEN,
      },
    });

    const status = response.data;
    ok(`Conexão com Z-API bem-sucedida — HTTP ${response.status}`);

    if (status?.connected === true) {
      ok("Instância conectada ao WhatsApp ✅");
    } else {
      err("Instância NÃO está conectada ao WhatsApp");
      inf(`Estado reportado: ${JSON.stringify(status)}`);
      inf("Acesse o painel da Z-API e escaneie o QR Code.");
    }

    return status?.connected === true;

  } catch (e) {
    const status = e.response?.status;
    const detalhe = JSON.stringify(e.response?.data ?? e.message);
    err(`Falha ao consultar status — ${status ? `HTTP ${status}` : "sem resposta"}`);
    err(`Detalhe: ${detalhe}`);
    if (status === 401 || status === 403) inf("Verifique ZAPI_TOKEN e ZAPI_CLIENT_TOKEN.");
    if (status === 404) inf("Verifique ZAPI_INSTANCE_ID — instância não encontrada.");
    return false;
  }
}

// ── 4. Z-API — envio de mensagem de teste ────────────────────
async function testarEnvioMensagem() {
  console.log("\n💬 [4/4] Z-API — envio de mensagem de teste");
  sep();

  if (!NUMERO_TESTE) {
    inf("NUMERO_TESTE não configurada — teste de envio pulado");
    inf("Para habilitar, defina NUMERO_TESTE=5511999999999 (com DDI)");
    return null;
  }

  if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN) {
    err("Credenciais Z-API incompletas — teste ignorado");
    return false;
  }

  try {
    const response = await axios.post(
      `${ZAPI_BASE}/send-text`,
      {
        phone: NUMERO_TESTE,
        message: "🔧 *Diagnóstico AutoPeças IA*\n\nMensagem de teste enviada com sucesso! Bot operacional ✅",
      },
      {
        headers: {
          "Client-Token": ZAPI_CLIENT_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    ok(`Mensagem enviada para ${NUMERO_TESTE} — HTTP ${response.status}`);
    inf(`Resposta Z-API: ${JSON.stringify(response.data)}`);
    return true;

  } catch (e) {
    const status = e.response?.status;
    const detalhe = JSON.stringify(e.response?.data ?? e.message);
    err(`Falha ao enviar mensagem — ${status ? `HTTP ${status}` : "sem resposta"}`);
    err(`Detalhe: ${detalhe}`);
    if (status === 400) inf("Verifique o formato do número em NUMERO_TESTE (ex: 5511999999999).");
    return false;
  }
}

// ── Resumo final ──────────────────────────────────────────────
function resumo(resultados) {
  console.log("\n📊 Resumo do diagnóstico");
  sep();

  const labels = {
    variaveis: "Variáveis de ambiente",
    claude:    "Claude API",
    zapiStatus:"Z-API status",
    envio:     "Envio de mensagem",
  };

  for (const [chave, resultado] of Object.entries(resultados)) {
    if (resultado === null) {
      inf(`${labels[chave]}: pulado`);
    } else if (resultado) {
      ok(`${labels[chave]}: OK`);
    } else {
      err(`${labels[chave]}: FALHOU`);
    }
  }

  const falhas = Object.values(resultados).filter((r) => r === false).length;
  console.log();
  if (falhas === 0) {
    console.log("🎉 Tudo certo! O bot está pronto para uso.\n");
  } else {
    console.log(`⚠️  ${falhas} teste(s) falharam. Corrija as configurações acima e rode novamente.\n`);
  }
}

// ── Ponto de entrada ──────────────────────────────────────────
(async () => {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║       AutoPeças IA — Diagnóstico de conexões         ║");
  console.log("╚══════════════════════════════════════════════════════╝");

  const variaveis  = testarVariaveis();
  const claude     = await testarClaude();
  const zapiStatus = await testarZAPIStatus();
  const envio      = await testarEnvioMensagem();

  const resultados = {
    variaveis,
    claude,
    zapiStatus,
    envio,
  };

  resumo(resultados);
})();
