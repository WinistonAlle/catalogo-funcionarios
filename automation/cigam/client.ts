/**
 * Cliente CIGAM — criação de pedido pela API REST (Portais Web API).
 *
 * HISTÓRICO IMPORTANTE (06/08/2026): este cliente dirigia as telas do PORTAL
 * DO REPRESENTANTE (MVC), fazendo scraping de HTML, porque toda gravação via
 * REST (`Pedido/Salvar`) devolvia 500 "Ocorreu uma falha.". O diagnóstico da
 * época — bug de parametrização do módulo Portais que só o CIGAM resolveria —
 * estava ERRADO.
 *
 * A causa real: o token do login REST (`genericos/ge/Login/Autenticar`)
 * autentica SEM contexto de empresa (VariacaoAmbiente=VW_GERAL, EmpresaLogada
 * vazia), e é isso que faz a gravação falhar. O token do login do PORTAL
 * (`CGPortal_Token`) carrega o contexto correto — usando ELE como Bearer, as
 * gravações REST funcionam normalmente. Descoberto e validado em produção pelo
 * projeto irmão pdv-gostinho-mineiro (server/src/cigam/client.ts), que cria
 * pedidos reais por REST puro desde 30/07/2026.
 *
 * Por isso o login por form POST continua aqui: não é mais para dirigir telas,
 * é só para obter um token com contexto de empresa.
 *
 * Fluxo do pedido:
 *   1. autenticar()                      -> CGPortal_Token (Bearer de tudo)
 *   2. POST comercial/fa/Pedido/Salvar   -> cabeçalho; o CIGAM gera o número
 *   3. POST .../Pedido/SalvarItemPedido  -> um por item
 *   4. POST .../Pedido/CalcularImposto   -> sem isto, Tipo Operação/CFOP e os
 *                                           totais do pedido ficam zerados
 *   5. (opcional) liberar p/ faturamento + efetivar — ver efetivarPedido
 */

export type CigamPedido = {
  /** Nosso código/ref (vai na observação). O CIGAM gera o número real do pedido. */
  codigo: string;
  observacao: string;
  /** yyyy-MM-dd. Default: hoje. */
  dataPedido?: string;
  codigoCondicaoPagamento?: string;
  tabelaPreco?: string;
  tipoNota?: string;
};

export type CigamItemPedido = {
  codigoMaterial: string;
  quantidade: number;
  precoUnitario: number;
  /**
   * KG, PCT, CX, UN... (products.cigam_unit). NÃO é enviado ao CIGAM: a API
   * REST deriva a unidade do próprio cadastro do material. Continua no tipo
   * porque quem monta o item (process-pending-orders) usa a unidade para
   * converter quantidade e preço antes de chegar aqui.
   */
  unidadeMedida: string;
  codigoCentroArmazenagem?: string;
};

export class CigamError extends Error {
  /**
   * Marca o caso específico "sessão derrubada por outro login" — que o CIGAM
   * reporta como HTTP 500 com "Usuário não autenticado" no corpo, não como
   * 401. Só este erro é elegível para relogin+retry (ver withAuthRetry);
   * qualquer outra falha sobe direto.
   */
  sessaoExpirada = false;

  constructor(
    message: string,
    public readonly status: number | null = null
  ) {
    super(message);
    this.name = "CigamError";
  }
}

/** Envelope padrão das respostas REST do CIGAM. */
type HttpCustomResponse<T = unknown> = {
  success: boolean;
  messages?: string[];
  data?: T;
  hash?: string;
};

export type CondicaoPagamento = {
  Codigo: string;
  Descricao: string;
  Ativo: boolean;
};

export type EfetivarResultado = {
  success: boolean;
  codigoNotaFiscal?: string;
  erro?: string;
};

/**
 * Resposta do Disponibilidade/Buscar. Duas armadilhas confirmadas ao vivo pelo
 * PDV (server/src/cigam/types.ts lá):
 *
 * 1. `EstoqueGeral` volta com colunas genéricas `CampoNNN` (projeção anônima do
 *    OData), não com os nomes que o /api/help documenta:
 *      Campo4   = unidade de negócio (empresa) da linha
 *      Campo6   = código do material
 *      Campo133 = saldo FÍSICO daquela empresa/material
 *
 * 2. `DisponibilidadeGeral` (que o nome sugere ser o campo certo) **ignora** a
 *    unidade de negócio pedida e devolve o total somado de todas as empresas
 *    que dividem o centro de armazenagem. Quem varia por empresa é o
 *    `EstoqueGeral`. Por isso lemos ele, e não aquele.
 *
 * `DemandasGerais`, ao contrário, vem com nomes reais — é o que já está
 * comprometido com pedidos em aberto. disponível = físico − demanda.
 */
type RetornoDisponibilidade = {
  DisponibilidadeGeral?: Array<Record<string, unknown>>;
  EstoqueGeral?: Array<{ Campo4?: string; Campo6?: string; Campo133?: number }>;
  DemandasGerais?: Array<{
    CodigoMaterial?: string;
    CodigoUnidadeNegocio?: string;
    QuantidadeSaldo?: number;
  }>;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new CigamError(`Variável de ambiente ${name} não configurada.`);
  return value;
}

function extractHidden(html: string, name: string): string {
  const escaped = name.replace(/[.[\]]/g, "\\$&");
  const m = html.match(new RegExp(`name="${escaped}"[^>]+value="([^"]*)"`, "i"));
  return m?.[1] ?? "";
}

/**
 * Data local em yyyy-MM-dd. Deliberadamente NÃO usa toISOString(): em
 * America/Sao_Paulo (UTC-3) ele vira o dia seguinte a partir das 21h, o que
 * mandaria pedidos da noite com a data de amanhã.
 */
function hojeLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const TIMEOUT_PADRAO_MS = 30_000;
/** Efetivar conversa com a SEFAZ — rotineiramente passa de 30s (visto no PDV). */
const TIMEOUT_EFETIVAR_MS = 60_000;

/**
 * Serial de propósito. Concorrência maior não acelera o `Disponibilidade/Buscar`
 * — só faz o CIGAM devolver linha vazia. Ver buscarDisponibilidades.
 */
const CONCORRENCIA_DISPONIBILIDADE = 1;
/** Repasses seriais sobre o que ficou faltando, com parada antecipada. */
const PASSADAS_EXTRAS_DISPONIBILIDADE = 2;

export class CigamClient {
  private cookieHeader: string | null = null;
  /** Bearer token (CGPortal_Token) — usado em TODAS as chamadas REST. */
  private token: string | null = null;
  /** Relogin em voo, compartilhado — ver withAuthRetry. */
  private reloginPromise: Promise<void> | null = null;

  private readonly cfg = {
    baseUrl:
      process.env.CIGAM_BASE_URL ??
      (process.env.CIGAM_API_URL ?? "").replace(/\/api\/api\/?$/, "").replace(/\/+$/, ""),
    /** Base REST (/api/api). */
    apiUrl: (
      process.env.CIGAM_API_URL ??
      `${(process.env.CIGAM_BASE_URL ?? "").replace(/\/+$/, "")}/api/api`
    ).replace(/\/+$/, ""),
    portalPath: process.env.CIGAM_PORTAL_PATH ?? "/portalrepresentante",
    user: () => requiredEnv("CIGAM_API_USER"),
    pass: () => requiredEnv("CIGAM_API_PASS"),
    codigoCliente: process.env.CIGAM_CODIGO_CLIENTE ?? "5",
    tabelaPreco: process.env.CIGAM_TABELA_PRECO ?? "005",
    condicaoPagamento: process.env.CIGAM_CONDICAO_PAGAMENTO ?? "260",
    tipoNota: process.env.CIGAM_TIPO_NOTA ?? "N",
    centroArmazenagem: process.env.CIGAM_CENTRO_ARMAZENAGEM ?? "001",
    unidadeNegocio: process.env.CIGAM_UNIDADE_NEGOCIO ?? "001",
    controle: process.env.CIGAM_CONTROLE ?? "20",
    /** Série da nota na efetivação. REC (recibo) — pedido de funcionário não emite NF-e. */
    serieNota: process.env.CIGAM_NOTA_SERIE ?? "REC",
  };

  private get portalUrl(): string {
    return `${this.cfg.baseUrl}${this.cfg.portalPath}`;
  }

  private static mergeSetCookies(existing: string, res: Response): string {
    const map = new Map<string, string>();
    for (const part of existing ? existing.split("; ") : []) {
      const eq = part.indexOf("=");
      if (eq > 0) map.set(part.slice(0, eq), part.slice(eq + 1));
    }
    const setCookies =
      typeof (res.headers as any).getSetCookie === "function"
        ? (res.headers as any).getSetCookie()
        : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie") as string]
        : [];
    for (const sc of setCookies as string[]) {
      const nameVal = (sc.split(";")[0] ?? "").trim();
      const eq = nameVal.indexOf("=");
      if (eq > 0) map.set(nameVal.slice(0, eq), nameVal.slice(eq + 1));
    }
    return Array.from(map, ([k, v]) => `${k}=${v}`).join("; ");
  }

  /**
   * Login no portal do representante (form POST) apenas para obter o
   * CGPortal_Token — ver o cabeçalho deste arquivo para o porquê de não usar
   * o login REST nativo.
   */
  async autenticar(): Promise<void> {
    const loginUrl = `${this.portalUrl}/`;

    // 1. GET página de login -> cookies de sessão + CSRF do form
    const pageRes = await fetch(loginUrl, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
    });
    let cookies = CigamClient.mergeSetCookies("", pageRes);
    const loginHtml = await pageRes.text();
    const csrf = extractHidden(loginHtml, "__RequestVerificationToken");
    if (!csrf) throw new CigamError("CSRF não encontrado na página de login do portal.");

    // 2. POST credenciais (sem seguir redirect) -> Set-Cookie CGPortal_Token
    const form = new URLSearchParams({
      __RequestVerificationToken: csrf,
      Usuario: this.cfg.user(),
      Senha: this.cfg.pass(),
      ContinuarConectado: "true",
      ContinuarConectadoHidden: "false",
      ReturnUrl: `${this.cfg.portalPath}/ge/pessoa`,
    });
    const loginRes = await fetch(loginUrl, {
      method: "POST",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookies,
        Referer: loginUrl,
      },
      body: form.toString(),
    });
    cookies = CigamClient.mergeSetCookies(cookies, loginRes);

    const token = /CGPortal_Token=([^;]+)/.exec(cookies)?.[1];
    if (!token) {
      throw new CigamError(
        "Login no portal falhou (CGPortal_Token não retornado). Confira usuário/senha.",
        loginRes.status
      );
    }
    this.cookieHeader = cookies;
    this.token = token;
  }

  private async ensureAuth(): Promise<string> {
    if (!this.token) await this.autenticar();
    return this.token!;
  }

  async verificarSessao(): Promise<boolean> {
    try {
      await this.ensureAuth();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * O CIGAM só admite UMA sessão ativa por usuário: se o mesmo login for usado
   * em outro lugar (o PDV da loja usa a mesma credencial), a sessão daqui é
   * invalidada silenciosamente e a próxima chamada falha com HTTP 500 trazendo
   * "Usuário não autenticado" no corpo — NÃO com 401. Por isso toda chamada
   * autenticada passa por aqui: detecta sessão morta, faz login de novo e
   * repete uma vez.
   *
   * O relogin em voo é compartilhado porque, com chamadas concorrentes (o sync
   * de estoque dispara várias), cada uma fazendo o próprio login invalidaria a
   * sessão que a outra acabou de obter — live-lock.
   */
  private async withAuthRetry<T>(request: () => Promise<T>): Promise<T> {
    await this.ensureAuth();
    try {
      return await request();
    } catch (err) {
      if (!(err instanceof CigamError) || !err.sessaoExpirada) throw err;
      if (!this.reloginPromise) {
        this.reloginPromise = this.autenticar().finally(() => {
          this.reloginPromise = null;
        });
      }
      await this.reloginPromise;
      return await request();
    }
  }

  /** Chamada REST autenticada. Devolve o envelope já parseado. */
  private async apiFetch<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    options: { body?: unknown; query?: Record<string, string>; timeoutMs?: number } = {}
  ): Promise<HttpCustomResponse<T>> {
    const url = new URL(`${this.cfg.apiUrl}${path}`);
    for (const [k, v] of Object.entries(options.query ?? {})) url.searchParams.set(k, v);

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_PADRAO_MS),
    });

    const texto = await res.text();
    let payload: any = null;
    try {
      payload = texto ? JSON.parse(texto) : null;
    } catch {
      // Resposta não-JSON (página de erro do IIS, HTML de login...) — o corpo
      // cru vira a mensagem, senão o erro sairia como "undefined".
      throw new CigamError(
        `Resposta inesperada do CIGAM em ${path} (HTTP ${res.status}): ${texto.slice(0, 200)}`,
        res.status
      );
    }

    const mensagens: string[] = payload?.messages ?? [];
    // Sessão derrubada por outro login chega como 500 + esta mensagem.
    if (mensagens.some((m) => /n[ãa]o autenticado/i.test(m))) {
      const erro = new CigamError("Sessão CIGAM expirada (usuário não autenticado).", res.status);
      erro.sessaoExpirada = true;
      throw erro;
    }

    if (!res.ok && payload?.success === undefined) {
      throw new CigamError(
        mensagens.join("; ") || `Falha na chamada ${path} (HTTP ${res.status}).`,
        res.status
      );
    }

    return payload as HttpCustomResponse<T>;
  }

  /** Cria o cabeçalho do pedido. Retorna o número gerado pelo CIGAM. */
  private async criarCabecalho(pedido: CigamPedido): Promise<string> {
    const data = await this.withAuthRetry(() =>
      this.apiFetch<{ codigoPedido: string }>("POST", "/comercial/fa/Pedido/Salvar", {
        body: {
          Codigo: "",
          CodigoCliente: this.cfg.codigoCliente,
          DataPedido: pedido.dataPedido ?? hojeLocal(),
          CodigoCondicaoPagamento: pedido.codigoCondicaoPagamento ?? this.cfg.condicaoPagamento,
          CodigoControle: this.cfg.controle,
          CodigoUnidadeNegocio: this.cfg.unidadeNegocio,
          TipoNota: pedido.tipoNota ?? this.cfg.tipoNota,
          Observacao: pedido.observacao,
        },
      })
    );

    if (!data.success) {
      throw new CigamError(
        data.messages?.join("; ") || "Falha ao criar cabeçalho do pedido no CIGAM."
      );
    }

    const codigo = data.data?.codigoPedido;
    if (!codigo) throw new CigamError("CIGAM não retornou o número do pedido.");
    return String(codigo);
  }

  private async adicionarItem(
    codigoPedido: string,
    sequencia: number,
    item: CigamItemPedido,
    tabelaPreco: string,
    prazo: string
  ): Promise<void> {
    const data = await this.withAuthRetry(() =>
      this.apiFetch("POST", "/comercial/fa/Pedido/SalvarItemPedido", {
        body: {
          CodigoPedido: codigoPedido,
          Sequencia: sequencia,
          CodigoMaterial: item.codigoMaterial,
          Quantidade: item.quantidade,
          PrecoUnitario: item.precoUnitario,
          PrecoOriginal: item.precoUnitario,
          CodigoTabelaPreco: tabelaPreco,
          // Obrigatórios na prática, apesar de a doc marcar como opcionais —
          // o CIGAM devolve 500 se vierem vazios.
          PrazoEntrega: prazo,
          PrazoProgramado: prazo,
          CodigoCentroArmazenagem: item.codigoCentroArmazenagem ?? this.cfg.centroArmazenagem,
        },
      })
    );

    if (!data.success) {
      throw new CigamError(
        data.messages?.join("; ") ||
          `Falha ao adicionar item ${item.codigoMaterial.trim()} (sequência ${sequencia}).`
      );
    }
  }

  /**
   * Dispara o cálculo de imposto/CFOP do pedido. Sem isto, "Tipo Operação" e os
   * totais do pedido ficam em branco/zerados no CIGAM. NÃO fatura o pedido.
   */
  async calcularImposto(codigoPedido: string): Promise<void> {
    const data = await this.withAuthRetry(() =>
      this.apiFetch("POST", "/comercial/fa/Pedido/CalcularImposto", {
        query: { codigoPedido },
      })
    );

    if (!data.success) {
      throw new CigamError(
        data.messages?.join("; ") || `Falha ao calcular impostos do pedido ${codigoPedido}.`
      );
    }
  }

  /**
   * Avança o pedido de CodigoControle "20" (Pedido Gerado) para "30" (Liberado
   * para Faturamento) — poupa o passo manual "Situação" no CIGAM Desktop.
   *
   * ATENÇÃO (confirmado ao vivo pelo PDV): este endpoint NÃO valida se a
   * transição é legal — um salto 30→90 (Cancelado) passou, enquanto o
   * Pedido/Salvar corretamente recusaria. Por isso o "30" é literal aqui;
   * nunca aceite um CodigoControle vindo de fora nesta chamada.
   */
  async liberarPedidoParaFaturamento(codigoPedido: string): Promise<void> {
    const data = await this.withAuthRetry(() =>
      this.apiFetch("PUT", "/comercial/fa/Pedido/AtualizarControlePedido", {
        body: {
          Codigo: codigoPedido,
          CodigoCliente: this.cfg.codigoCliente,
          CodigoControle: "30",
        },
      })
    );

    if (!data.success) {
      throw new CigamError(
        data.messages?.join("; ") || `Falha ao liberar o pedido ${codigoPedido} para faturamento.`
      );
    }
  }

  /**
   * Efetiva o pedido (controle "40") emitindo o documento da série configurada.
   * Para o catálogo de funcionários a série é REC (recibo) — decisão do
   * usuário 06/08/2026: pedido de funcionário NÃO emite NF-e, diferente do PDV
   * da loja (que usa CF1/NFE e transmite à SEFAZ).
   *
   * TipoFrete "F" (Sem Frete) com todos os campos de transporte em branco: no
   * PDV, tentar "1" (Emitente) com UF preenchida e Placa vazia fez a SEFAZ
   * rejeitar o XML por schema E queimar um número sequencial de nota real.
   */
  async efetivarPedido(
    codigoPedido: string,
    itens: Array<{ sequencia: number; quantidade: number }>
  ): Promise<EfetivarResultado> {
    const agora = new Date();
    const data = await this.withAuthRetry(() =>
      this.apiFetch<{ codigoNotaFiscal?: string; erro?: string }>(
        "POST",
        "/comercial/fa/Pedido/Efetivar",
        {
          body: {
            Efetivacao: "S",
            Serie: this.cfg.serieNota,
            Transportadora: "",
            TipoFrete: "F",
            Placa: "",
            UF: "",
            Marca: "",
            Volume: 0,
            Quantidade: 0,
            Especie: "",
            DataSaida: hojeLocal(),
            HoraSaida: agora.toTimeString().slice(0, 8),
            UnidadeNegocio: this.cfg.unidadeNegocio,
            Pedido: {
              Codigo: codigoPedido,
              Itens: itens.map((i) => ({ SequenciaItem: i.sequencia, Quantidade: i.quantidade })),
            },
          },
          timeoutMs: TIMEOUT_EFETIVAR_MS,
        }
      )
    );

    return {
      success: data.success,
      codigoNotaFiscal: data.data?.codigoNotaFiscal || undefined,
      erro: data.data?.erro,
    };
  }

  /**
   * Cria o pedido completo (cabeçalho + itens + cálculo de imposto) no CIGAM.
   * O CIGAM gera o número do pedido — retornado em `cigamOrderId`.
   *
   * `onHeaderCreated` é chamado logo após criar o cabeçalho (antes dos itens),
   * com o número gerado. Use para persistir o id imediatamente e evitar
   * duplicata caso a adição de itens falhe no meio.
   *
   * A liberação para faturamento é best-effort: uma falha ali não invalida um
   * pedido que já está inteiro e correto no CIGAM — só significa que alguém
   * vai clicar em "Situação" no Desktop, exatamente como era antes. Já uma
   * falha no cálculo de imposto é fatal, porque o pedido ficaria com totais
   * zerados.
   */
  async criarPedidoCompleto(
    pedido: CigamPedido,
    itens: CigamItemPedido[],
    onHeaderCreated?: (cigamOrderId: string) => Promise<void> | void
  ): Promise<{ cigamOrderId: string; itensEnviados: number; liberadoParaFaturamento: boolean }> {
    if (itens.length === 0) throw new CigamError(`Pedido ${pedido.codigo} sem itens.`);

    await this.ensureAuth();
    const cigamOrderId = await this.criarCabecalho(pedido);
    await onHeaderCreated?.(cigamOrderId);

    const tabela = pedido.tabelaPreco ?? this.cfg.tabelaPreco;
    const prazo = pedido.dataPedido ?? hojeLocal();
    let enviados = 0;
    for (const [index, item] of itens.entries()) {
      await this.adicionarItem(cigamOrderId, index + 1, item, tabela, prazo);
      enviados++;
    }

    await this.calcularImposto(cigamOrderId);

    let liberadoParaFaturamento = false;
    try {
      await this.liberarPedidoParaFaturamento(cigamOrderId);
      liberadoParaFaturamento = true;
    } catch (err) {
      console.error(
        `[cigam] pedido ${cigamOrderId} criado, mas não foi possível liberar para faturamento ` +
          `automaticamente — seguirá exigindo o passo manual "Situação" no CIGAM Desktop:`,
        err instanceof Error ? err.message : err
      );
    }

    return { cigamOrderId, itensEnviados: enviados, liberadoParaFaturamento };
  }

  /**
   * Preços de uma tabela do CIGAM (a de funcionário é a `005`). Retorna um Map
   * código-do-material → preço unitário.
   *
   * O preço é sempre **por unidade de medida do material**: para material com
   * `CodigoUnidadeMedida = KG`, é R$/kg — não o preço do pacote. É a mesma
   * semântica de `products.employee_price` (ver src/lib/pricing.ts, que faz
   * `preço/kg × weight`).
   *
   * Dois detalhes confirmados ao vivo (primeiro no PDV, depois aqui):
   * - Os campos reais são `Elemento` (código do material), `CodigoTabela` e
   *   `PrecoUnitario` — **não** os nomes que o /api/help documenta
   *   (`CodigoMaterial`/`CodigoTabelaPreco`/`PrecoVenda`).
   * - `CodigoTabela` vem preenchido com espaços à direita numa largura fixa que
   *   não dá pra reproduzir com segurança num `eq` do OData, então o filtro por
   *   tabela é feito aqui, no cliente, e não na query.
   */
  async buscarPrecosTabela(codigoTabela: string): Promise<Map<string, number>> {
    const PAGE = 500;
    const alvo = codigoTabela.trim();
    const precos = new Map<string, number>();
    let skip = 0;

    await this.ensureAuth();

    while (true) {
      const data = await this.withAuthRetry(() =>
        this.apiFetch<any[]>("GET", "/genericos/ge/PrecosTabela/Buscar", {
          query: {
            $top: String(PAGE),
            $skip: String(skip),
            // Materiais de produto acabado começam com "002" — mesmo truque de
            // filtro por grupo usado no PDV, já que este endpoint não tem campo
            // de grupo próprio.
            $filter: "startswith(Elemento, '002')",
          },
        })
      );

      const linhas: any[] = Array.isArray(data) ? data : ((data as any)?.data ?? []);
      if (linhas.length === 0) break;

      for (const linha of linhas) {
        if (String(linha?.CodigoTabela ?? "").trim() !== alvo) continue;
        const codigo = String(linha?.Elemento ?? "").trim();
        const preco = Number(linha?.PrecoUnitario);
        if (codigo && Number.isFinite(preco)) precos.set(codigo, preco);
      }

      if (linhas.length < PAGE) break;
      skip += PAGE;
    }

    return precos;
  }

  /**
   * Condições de pagamento cadastradas. ATENÇÃO: este endpoint só devolve as
   * que têm "Publicar na Web" marcado no CIGAM Desktop — uma condição que
   * existe mas não aparece aqui quase sempre é isso, não erro de código.
   */
  async buscarCondicoesPagamento(): Promise<CondicaoPagamento[]> {
    const data = await this.withAuthRetry(() =>
      this.apiFetch<CondicaoPagamento[]>("GET", "/financas/gf/CondicaoPagamento/Buscar", {
        query: { $filter: "Ativo eq true" },
      })
    );
    const rows = (Array.isArray(data) ? data : data.data) as CondicaoPagamento[] | undefined;
    return (rows ?? []).filter((c) => c.Ativo);
  }

  /**
   * Saldo DISPONÍVEL de um material na unidade configurada: o físico menos o
   * que já está comprometido com pedidos em aberto. Retorna `null` quando não
   * dá pra determinar.
   *
   * `null` NÃO é o mesmo que zero confirmado. Se o CIGAM devolve uma linha de
   * EstoqueGeral, ela é confiável — inclusive quando o saldo é 0. Mas quando
   * não vem linha nenhuma é ambíguo: pode ser "não tem nada aqui" ou "o CIGAM
   * simplesmente não respondeu isso agora". O PDV confirmou ao vivo que, sob
   * carga concorrente, materiais que respondem saldo normalmente numa chamada
   * isolada voltam sem linha nenhuma — tratar isso como zero fez ~90% do
   * catálogo aparecer esgotado. Por isso: sem linha → null → o app deixa passar.
   */
  async buscarDisponibilidade(codigoMaterial: string): Promise<number | null> {
    const codigo = codigoMaterial.trim();
    const unidade = this.cfg.unidadeNegocio.trim();

    const resposta = (await this.withAuthRetry(() =>
      this.apiFetch<unknown>("POST", "/suprimentos/es/Disponibilidade/Buscar", {
        body: {
          Origem: "CATALOGO",
          CodigoMaterial: codigo,
          CodigoUnidadeNegocio: unidade,
          CodigoCentroArmazenagem: this.cfg.centroArmazenagem,
          CodigoUsuario: this.cfg.user(),
        },
      })
      // Este endpoint NÃO usa o envelope {success, messages, data} — o corpo já
      // É o RetornoDisponibilidade. Confirmado ao vivo pelo PDV.
    )) as unknown as RetornoDisponibilidade;

    const linhas = (resposta.EstoqueGeral ?? []).filter(
      (l) => String(l.Campo6 ?? "").trim() === codigo && String(l.Campo4 ?? "").trim() === unidade
    );
    if (linhas.length === 0) return null;

    const fisico = linhas.reduce((soma, l) => soma + Number(l.Campo133 ?? 0), 0);

    const comprometido = (resposta.DemandasGerais ?? [])
      .filter(
        (d) =>
          String(d.CodigoMaterial ?? "").trim() === codigo &&
          String(d.CodigoUnidadeNegocio ?? "").trim() === unidade
      )
      .reduce((soma, d) => soma + Number(d.QuantidadeSaldo ?? 0), 0);

    // Sem clamp em 0 de propósito: negativo significa que já se comprometeu
    // mais do que existe fisicamente — sinal real, que deve bloquear a venda,
    // e não virar zero silenciosamente.
    return Number((fisico - comprometido).toFixed(3));
  }

  /**
   * Versão em lote do buscarDisponibilidade. O endpoint só aceita um material
   * por chamada, então isso é um laço — e a concorrência dele é **1 de
   * propósito**.
   *
   * Concorrência alta não acelera: faz o CIGAM devolver linha vazia, e cada
   * linha vazia vira material com estoque desconhecido. O PDV mediu isso ao
   * vivo (`catalogCache.ts`):
   *
   *     concorrência  3 ->  9 OK / 1 falha
   *     concorrência 10 ->  3 OK / 7 falha
   *     concorrência  1 -> zero erros, ~197ms por material
   *
   * E serial **não é mais lento na prática**: com 3, a passada concorrente
   * levava ~16s mas deixava ~125 irresolvidos, cujo retry serial somava ~25s
   * de qualquer forma — mesmo tempo de parede, mais erro no log e ~10
   * materiais terminando o ciclo desconhecidos.
   *
   * Confirmado aqui em 12/08/2026, quando isto ainda usava 8: uma rodada
   * devolveu 49 de 172 materiais sem linha mesmo depois do retry. Para 172
   * materiais, serial dá ~35s — o sync roda de 30 em 30 min, então é ~2% de
   * ocupação.
   *
   * As passadas extras repetem só o que ficou faltando e param assim que uma
   * delas não recupera mais nada: se um material não voltou nem sozinho e sem
   * pressa, a ausência provavelmente é real (material sem estoque cadastrado),
   * e insistir só gera carga. Materiais que continuarem indefinidos ficam FORA
   * do Map — o chamador trata ausência como desconhecido, nunca como zero.
   */
  async buscarDisponibilidades(
    codigos: string[],
    opcoes: { concorrencia?: number; onProgresso?: (feitos: number, total: number) => void } = {}
  ): Promise<Map<string, number>> {
    const codes = [...new Set(codigos.map((c) => c.trim()).filter(Boolean))];
    const saldos = new Map<string, number>();
    if (codes.length === 0) return saldos;

    await this.ensureAuth();

    const consultar = async (lista: string[], concorrencia: number) => {
      let cursor = 0;
      let feitos = 0;
      const trabalhador = async () => {
        while (cursor < lista.length) {
          const codigo = lista[cursor++];
          try {
            const saldo = await this.buscarDisponibilidade(codigo);
            if (saldo !== null) saldos.set(codigo, saldo);
          } catch {
            // Fail-open: deixa fora do Map (= desconhecido). Uma falha de rede
            // num material não pode derrubar o sync inteiro.
          }
          opcoes.onProgresso?.(++feitos, lista.length);
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(concorrencia, lista.length) }, trabalhador)
      );
    };

    await consultar(codes, opcoes.concorrencia ?? CONCORRENCIA_DISPONIBILIDADE);

    for (let passada = 0; passada < PASSADAS_EXTRAS_DISPONIBILIDADE; passada++) {
      const faltantes = codes.filter((c) => !saldos.has(c));
      if (faltantes.length === 0) break;
      const antes = saldos.size;
      await consultar(faltantes, 1);
      if (saldos.size === antes) break; // nada recuperado: o resto é ausência real
    }

    return saldos;
  }

  /**
   * @deprecated Lê `Estoque/Buscar`, que devolve o saldo FÍSICO — sem descontar
   * o que já está comprometido com pedidos em aberto. Mantido só por
   * compatibilidade; use `buscarDisponibilidades`, que é o número que de fato
   * pode ser vendido.
   *
   * Consulta o saldo de estoque (centro/unidade configurados) dos materiais
   * informados. Retorna um Map código-do-material → saldo total.
   * Materiais sem linha de estoque simplesmente não aparecem no Map
   * (o consumidor decide o que fazer — aqui tratamos ausência como desconhecido).
   */
  async buscarSaldos(codigos: string[]): Promise<Map<string, number>> {
    const saldos = new Map<string, number>();
    const codes = [...new Set(codigos.map((c) => c.trim()).filter(Boolean))];
    if (codes.length === 0) return saldos;

    await this.ensureAuth();
    const unidade = this.cfg.unidadeNegocio;
    const CHUNK = 40; // limita o tamanho do $filter por requisição

    for (let i = 0; i < codes.length; i += CHUNK) {
      const chunk = codes.slice(i, i + CHUNK);
      const orFilter = chunk.map((c) => `Estoque/CodigoMaterial eq '${c}'`).join(" or ");
      const filter = `(${orFilter}) and Estoque/CodigoUnidadeNegocio eq '${unidade}'`;

      const data = await this.withAuthRetry(() =>
        this.apiFetch<any[]>("GET", "/suprimentos/es/Estoque/Buscar", {
          query: { $filter: filter, $top: "500" },
        })
      );

      const rows: any[] = Array.isArray(data) ? data : ((data as any)?.data ?? []);
      for (const row of rows) {
        const e = row?.Estoque ?? {};
        const cod = String(e.CodigoMaterial ?? "").trim();
        const saldo = Number(e.Saldo);
        if (cod) saldos.set(cod, (saldos.get(cod) ?? 0) + (Number.isFinite(saldo) ? saldo : 0));
      }
    }
    return saldos;
  }
}
