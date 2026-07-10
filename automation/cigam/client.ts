/**
 * Cliente da API Portais CIGAM (https://gostinhomineiroportais.cigam.cloud/api/help).
 *
 * Fluxo validado em 10/07/2026:
 * - POST Login/Autenticar { NomeUsuario, Senha } -> { hash } usado como Bearer
 * - POST Pedido/Salvar (cabeçalho) + POST Pedido/SalvarItemPedido (um por item)
 * - GET  Pedido/BuscarPedido / BuscarItensPedido para conferência e idempotência
 *
 * Atenção: o caminho real dos endpoints tem /api duplicado (ex.:
 * https://servidor/api/api/comercial/fa/Pedido/Salvar).
 */

export type CigamResponse<T = unknown> = {
  success: boolean;
  hash: string | null;
  messages: string[];
  data: T | null;
  tipoLogin: string | null;
};

export type CigamPedido = {
  codigo: string;
  observacao: string;
  dataPedido?: string; // yyyy-MM-dd
  codigoCondicaoPagamento?: string;
  tipoNota?: string;
};

export type CigamItemPedido = {
  codigoPedido: string;
  sequencia: number;
  codigoMaterial: string;
  quantidade: number;
  precoUnitario: number;
  codigoCentroArmazenagem?: string;
};

export class CigamError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
    public readonly cigamMessages: string[] = []
  ) {
    super(message);
    this.name = "CigamError";
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new CigamError(`Variável de ambiente ${name} não configurada.`);
  }
  return value;
}

export class CigamClient {
  private hash: string | null = null;

  private get baseUrl(): string {
    return requiredEnv("CIGAM_API_URL").replace(/\/+$/, "");
  }

  private get codigoCliente(): string {
    return process.env.CIGAM_CODIGO_CLIENTE ?? "5";
  }

  private get tabelaPreco(): string {
    return process.env.CIGAM_TABELA_PRECO ?? "005";
  }

  async autenticar(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/genericos/ge/Login/Autenticar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        NomeUsuario: requiredEnv("CIGAM_API_USER"),
        Senha: requiredEnv("CIGAM_API_PASS"),
      }),
    });

    const payload = (await res.json().catch(() => null)) as CigamResponse | null;

    if (!res.ok || !payload?.success || !payload.hash) {
      throw new CigamError(
        `Falha ao autenticar no CIGAM: ${payload?.messages?.join("; ") || res.status}`,
        res.status,
        payload?.messages ?? []
      );
    }

    this.hash = payload.hash;
  }

  /**
   * Executa uma requisição autenticada. Se a sessão tiver expirado (401),
   * reautentica uma vez e repete.
   */
  private async request(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    options: { query?: Record<string, string>; body?: unknown } = {},
    retryAuth = true
  ): Promise<unknown> {
    if (!this.hash) {
      await this.autenticar();
    }

    const url = new URL(`${this.baseUrl}/${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.hash}`,
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });

    if (res.status === 401 && retryAuth) {
      this.hash = null;
      return this.request(method, path, options, false);
    }

    const text = await res.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      throw new CigamError(
        `Resposta inesperada do CIGAM em ${path}: ${text.slice(0, 200)}`,
        res.status
      );
    }

    // Alguns endpoints respondem o envelope HttpCustomResponse, outros o dado cru.
    const envelope =
      payload && typeof payload === "object" && "success" in (payload as object)
        ? (payload as CigamResponse)
        : null;

    if (!res.ok || (envelope && !envelope.success)) {
      throw new CigamError(
        `CIGAM ${method} ${path} falhou: ${envelope?.messages?.join("; ") || `HTTP ${res.status}`}`,
        res.status,
        envelope?.messages ?? []
      );
    }

    return envelope ? envelope.data : payload;
  }

  async verificarSessao(): Promise<boolean> {
    try {
      await this.request("POST", "genericos/ge/Sessao/VerificarSessao", { body: {} });
      return true;
    } catch {
      return false;
    }
  }

  async buscarPedido(codigoPedido: string): Promise<unknown | null> {
    return this.request("GET", "comercial/fa/Pedido/BuscarPedido", {
      query: { codigoPedido },
    });
  }

  async buscarItensPedido(codigoPedido: string): Promise<unknown[]> {
    const data = await this.request("GET", "comercial/fa/Pedido/BuscarItensPedido", {
      query: { codigoPedido },
    });
    return Array.isArray(data) ? data : [];
  }

  async salvarPedido(pedido: CigamPedido): Promise<void> {
    await this.request("POST", "comercial/fa/Pedido/Salvar", {
      body: {
        Codigo: pedido.codigo,
        CodigoCliente: this.codigoCliente,
        CodigoTabelaPreco: this.tabelaPreco,
        Observacao: pedido.observacao,
        ...(pedido.dataPedido ? { DataPedido: pedido.dataPedido } : {}),
        ...(pedido.codigoCondicaoPagamento
          ? { CodigoCondicaoPagamento: pedido.codigoCondicaoPagamento }
          : {}),
        ...(pedido.tipoNota ? { TipoNota: pedido.tipoNota } : {}),
      },
    });
  }

  async salvarItemPedido(item: CigamItemPedido): Promise<void> {
    await this.request("POST", "comercial/fa/Pedido/SalvarItemPedido", {
      body: {
        CodigoPedido: item.codigoPedido,
        Sequencia: item.sequencia,
        CodigoMaterial: item.codigoMaterial,
        Quantidade: item.quantidade,
        PrecoUnitario: item.precoUnitario,
        ...(item.codigoCentroArmazenagem
          ? { CodigoCentroArmazenagem: item.codigoCentroArmazenagem }
          : {}),
      },
    });
  }

  /**
   * Cria o pedido completo (cabeçalho + itens) de forma idempotente e
   * retomável: se o cabeçalho já existir no CIGAM, aproveita; itens já
   * lançados (por sequência) não são reenviados. Assim, uma falha parcial
   * pode ser corrigida reexecutando a mesma chamada.
   */
  async criarPedidoCompleto(
    pedido: CigamPedido,
    itens: Omit<CigamItemPedido, "codigoPedido" | "sequencia">[]
  ): Promise<{ codigo: string; itensEnviados: number; itensJaExistentes: number }> {
    if (itens.length === 0) {
      throw new CigamError(`Pedido ${pedido.codigo} sem itens.`);
    }

    const existente = await this.buscarPedido(pedido.codigo);
    if (!existente) {
      await this.salvarPedido(pedido);
    }

    const itensExistentes = existente ? await this.buscarItensPedido(pedido.codigo) : [];
    const sequenciasExistentes = new Set(
      itensExistentes
        .map((item) => Number((item as any)?.Sequencia))
        .filter((seq) => Number.isFinite(seq))
    );

    let enviados = 0;
    for (let index = 0; index < itens.length; index++) {
      const sequencia = index + 1;
      if (sequenciasExistentes.has(sequencia)) continue;

      await this.salvarItemPedido({
        ...itens[index],
        codigoPedido: pedido.codigo,
        sequencia,
      });
      enviados++;
    }

    return {
      codigo: pedido.codigo,
      itensEnviados: enviados,
      itensJaExistentes: sequenciasExistentes.size,
    };
  }
}
