
import { Category, Product } from '../types/products';

// Número do WhatsApp para pedidos
export const STORE_WHATSAPP = '5561985941557';

// Requisitos mínimos de pedido
export const MIN_PACKAGES = 5;
export const MIN_WEIGHT_KG = 5;

// Categorias disponíveis
export const CATEGORIES: Category[] = [
  'Salgados P/ Fritar',
  'Salgados Assados',
  'Pães e Massas Doces',
  'Pão de Queijo',
  'Biscoito de Queijo',
  'Salgados Grandes',
  'Alho em creme',
  'Outros',
  'Kits e Combos'
];

// Ordenação de categorias por prioridade de exibição
export const ORDERED_CATEGORIES: Category[] = [
  'Pão de Queijo',
  'Salgados Assados',
  'Salgados P/ Fritar',
  'Pães e Massas Doces',
  'Biscoito de Queijo',
  'Salgados Grandes',
  'Alho em creme',
  'Outros',
  'Kits e Combos'
];

// Produtos campeões de vendas em 2025
export const TOP_SELLING_PRODUCTS = [
  "PAO DE QUEIJO PREMIUM 30G PCT 5KG",
  "PAO DE QUEIJO GG 25G PCT 1KG",
  "SALG FESTA COXINHA PCT 50 UNID",
  "MINI ESFIRRA DE CARNE ASSADO PCT 50 UNID",
  "BISCOITO DE QUEIJO GG PCT 1KG",
  "PAO DE QUEIJO GG 55G PCT 5KG",
  "ENR SALSICHA C/ MOLHO ASSADO G PCT 10 UNID",
  "MINI ENR DE SALSICHA ASSADO PCT 50 UNID",
  "PAO DE QUEIJO RECHEADO C/ LINGUICA APIMENTADA PCT 1KG",
  "QUEBRADOR DE QUEIJO SF 20G PCT 800G",
  "ALHO EM CREME COM TRADICIONAL OMG POTE 200G"
];

// Lista de todos os produtos
export const PRODUCTS: Product[] = [
  // Pão de Queijo - na ordem especificada

  //PAO DE QUIJO 

  //PREMIUM
   
  {
    "id": "10010",
    "name": "PAO DE QUEIJO PREMIUM 30G PCT 1KG",
    "price": 22.99,
    "category": "Pão de Queijo",
    "images": ["/products/10010.jpg"],
    "description": "Pão de queijo premium congelado, tamanho médio (30g). Pacote com aproximadamente 33 unidades.",
    "packageInfo": "Pacote 1kg",
    "weight": 1.0,
    "isPackage": true,
    "featured": true
  },
  {
    "id": "50659",
    "name": "PAO DE QUEIJO PREMIUM 30G PCT 5KG",
    "price": 114.95,
    "category": "Pão de Queijo",
    "images": ["/products/10010.jpg"],
    "description": "Pão de queijo premium congelado, tamanho médio (30g). Pacote com aproximadamente 166 unidades.",
    "packageInfo": "Pacote 5kg",
    "weight": 5.0,
    "isPackage": false,
    // "featured": true // true: Para produto em destaque
  },
  {
    "id": "50732",
    "name": "PAO DE QUEIJO PREMIUM 30G PCT 800G",
    "price": 19.0,
    "category": "Pão de Queijo",
    "images": ["/products/50732.jpg"],
    "description": "Pão de queijo premium congelado, tamanho tradicional (30g). Pacote com aproximadamente 26 unidades.",
    "packageInfo": "Pacote 800g",
    "weight": 0.8,
    "isPackage": true
  },
  {
    "id": "10020",
    "name": "PAO DE QUEIJO PREMIUM 30G PCT 400G",
    "price": 9.5,
    "category": "Pão de Queijo",
    "images": ["/products/10010.jpg"],
    "description": "Pão de queijo premium congelado, tamanho tradicional (30g). Pacote com aproximadamente 13 unidades.",
    "packageInfo": "Pacote 400g",
    "weight": 0.4,
    "isPackage": true
  },
  {
    "id": "50653",
    "name": "PAO DE QUEIJO PREMIUM 55G PCT 5KG",
    "price": 114.95,
    "category": "Pão de Queijo",
    "images": ["/products/50653.jpg"],
    "description": "Pão de queijo premium congelado, tamanho grande (55g). Pacote com aproximadamente 90 unidades.",
    "packageInfo": "Pacote 5kg",
    "weight": 5.0,
    "isPackage": false
  },
  {
    "id": "507442",
    "name": "PAO DE QUEIJO PREMIUM 70G PCT 5KG",
    "price": 114.95,
    "category": "Pão de Queijo",
    "images": ["/products/50653.jpg"],
    "description": "Pão de queijo premium congelado, tamanho grande (70g). Pacote com aproximadamente 71 unidades.",
    "packageInfo": "Pacote 5kg",
    "weight": 5.0,
    "isPackage": false
  },
  {
    "id": "50657",
    "name": "PAO DE QUEIJO PREMIUM 100G PCT 5KG",
    "price": 114.95,
    "category": "Pão de Queijo",
    "images": ["/products/50657.jpg"],
    "description": "Pão de queijo premium congelado, tamanho extra grande (100g). Pacote com aproximadamente 50 unidades.",
    "packageInfo": "Pacote 5kg",
    "weight": 5.0,
    "isPackage": false
  },

  //GG
    {
    "id": "10034",
    "name": "PAO DE QUEIJO GG 15G PCT 1KG",
    "price": 18.40,
    "category": "Pão de Queijo",
    "images": ["/products/10034.jpg"],
    "description": "Pão de queijo GG congelado, tamanho coquetel (15g). Pacote com aproximadamente 66 unidades.",
    "packageInfo": "Pacote 1kg",
    "weight": 1.0,
    "isPackage": true
  },
    {
    "id": "10025",
    "name": "PAO DE QUEIJO GG 25G PCT 1KG",
    "price": 18.40,
    "category": "Pão de Queijo",
    "images": ["/products/10025.jpg"],
    "description": "Pão de queijo GG congelado, tamanho tradicional (25g). Pacote com aproximadamente 40 unidades.",
    "packageInfo": "Pacote 1kg",
    "weight": 1.0,
    "isPackage": true
  },
  {
    "id": "10002",
    "name": "PAO DE QUEIJO GG 55G PCT 5KG",
    "price": 92,
    "category": "Pão de Queijo",
    "images": ["/products/50405.jpg"],
    "description": "Pão de queijo GG congelado, tamanho lanche (55g). Pacote com aproximadamente 90 unidades.",
    "packageInfo": "Pacote 5kg",
    "weight": 5.0,
    "isPackage": false
  },
  {
    "id": "50405",
    "name": "PAO DE QUEIJO GG 100G PCT 5KG",
    "price": 92,
    "category": "Pão de Queijo",
    "images": ["/products/50405.jpg"],
    "description": "Pão de queijo GG congelado, tamanho grande (100g). Pacote com aproximadamente 50 unidades.",
    "packageInfo": "Pacote 5kg",
    "weight": 5.0,
    "isPackage": false
  },
  
  
  //GM
  {
    "id": "50407",
    "name": "PAO DE QUEIJO GM 30G PCT 800G",
    "price": 20,
    "category": "Pão de Queijo",
    "images": ["/products/50407.jpg"],
    "description": "Pão de queijo GM, tamanho tradicional (30g). Pacote com aproximadamente 26 unidades.",
    "packageInfo": "Pacote 800g",
    "weight": 0.8,
    "isLaunch": true,
    "isPackage": true,
  },
  {
    "id": "50406",
    "name": "PAO DE QUEIJO GM 30G PCT 400G",
    "price": 10.0,
    "category": "Pão de Queijo",
    "images": ["/products/50407.jpg"],
    "description": "Pão de queijo GM, tamanho tradicional (30g). Pacote com aproximadamente 13 unidades.",
    "packageInfo": "Pacote 400g",
    "weight": 0.4,
    "isLaunch": true,
    "isPackage": true
  },
  // {
  //   "id": "PQ102",
  //   "name": "PAO DE QUEIJO GOURMET PCT 400G",
  //   "price": 10.2,
  //   "category": "Pão de Queijo",
  //   "images": ["/products/pao-de-queijo-premium.jpg"],
  //   "description": "Pão de queijo gourmet. Pacote com aproximadamente 13 unidades.",
  //   "packageInfo": "Pacote 400g",
  //   "weight": 0.4,
  //   "isPackage": true
  // },
  {
    "id": "507466",
    "name": "HOT CHEESE 1KG",
    "price": 33.0,
    "category": "Pão de Queijo",
    "images": ["/products/507466.jpg"],
    "description": "POTE DE 01KG",
    "packageInfo": "Pote 1kg",
    "weight": 1.0,
    "isPackage": true,
    "inStock": false
  },
  
  {
    "id": "56",
    "name": "DADINHO DE TAPIOCA PCT DE 1KG",
    "price": 22.00,
    "category": "Pão de Queijo",
    "images": ["/products/56.jpg"],
    "description": "Dadinho de Tapioca, pacote de 1kg. Aproximadamente 40 unidades (25g).",
    "packageInfo": "Pacote 1kg",
    "weight": 1.0,
    "isPackage": true
  },
  {
    "id": "628",
    "name": "DADINHO DE TAPIOCA PCT DE 400G",
    "price": 8.30,
    "category": "Pão de Queijo",
    "images": ["/products/628.jpg"],
    "description": "Dadinho de Tapioca, pacote de 400g. Aproximadamente 16 unidades (25g).",
    "packageInfo": "Pacote 400g",
    "weight": 0.400,
    "isPackage": true
  },
  {
    "id": "50705",
    "name": "PAO DE QUEIJO SEM LACTOSE PCT 400G",
    "price": 12.10,
    "category": "Pão de Queijo",
    "images": ["/products/50705.jpg"],
    "description": "Pão de Queijo Sem Lactose GM, pacote de 400g. Aproximadamente 16 unidades. (25g).",
    "packageInfo": "Pacote 400g",
    "weight": 0.400,
    "isPackage": true
  },
  {
    "id": "50707",
    "name": "PAO DE TAPIOCA COM COCO PCT 400G",
    "price": 12.10,
    "category": "Pão de Queijo",
    "images": ["/products/50707.jpg"],
    "description": "Pão de tapioca com coco, pacote de 400g. Aproximadamente 16 unidades. (25g).",
    "packageInfo": "Pacote 400g",
    "weight": 0.400,
    "isPackage": true
  },
  {
    "id": "50706",
    "name": "PAO DE TAPIOCA COM QUEIJO PCT 400G",
    "price": 9.90,
    "category": "Pão de Queijo",
    "images": ["/products/50706.jpg"],
    "description": "Pão de tapioca com queijo, pacote de 400g. Aproximadamente 16 unidades. (25g).",
    "packageInfo": "Pacote 400g",
    "weight": 0.400,
    "isPackage": true
  },
  {
    "id": "50709",
    "name": "PALITO DE QUEIJO GOURMET PCT 400G ",
    "price": 10.20,
    "category": "Pão de Queijo",
    "images": ["/products/50709.jpg"],
    "description": "Palito de queijo gourmet, pacote de 400g. Aproximadamente 16 unidades. (25g).",
    "packageInfo": "Pacote 400g",
    "weight": 0.400,
    "isPackage": true
  },
  {
    "id": "50404",
    "name": "QUEBRADOR DE QUEIJO SF 20G PCT 800G",
    "price": 27.20,
    "category": "Biscoito de Queijo",
    "images": ["/products/50404.jpg"],
    "description": "Quebrador de queijo sem fermento (20g). Pacote com aproximadamente 40 unidades.",
    "packageInfo": "Pacote 800g",
    "weight": 0.8,
    "isPackage": true
  },
  {
    "id": "50403",
    "name": "QUEBRADOR DE QUEIJO SF 20G PCT 400G",
    "price": 14.30,
    "category": "Biscoito de Queijo",
    "images": ["/products/50403.jpg"],
    "description": "Quebrador de queijo sem fermento (20g). Pacote com aproximadamente 20 unidades.",
    "packageInfo": "Pacote 400g",
    "weight": 0.4,
    "isPackage": true
  },
  {
    "id": "50402",
    "name": "BISCOITO DE QUEIJO SF 40G PCT 800G",
    "price": 28.60,
    "category": "Biscoito de Queijo",
    "images": ["/products/50402.jpg"],
    "description": "Biscoito tipo caseiro sabor da fazenda. Pacote com aproximadamente 20 unidades.",
    "packageInfo": "Pacote 800g",
    "weight": 0.8,
    "isPackage": true
  },
  {
    "id": "50401",
    "name": "BISCOITO DE QUEIJO SF 40G PCT 400G",
    "price": 14.30,
    "category": "Biscoito de Queijo",
    "images": ["/products/50401.jpg"],
    "description": "Biscoito tipo caseiro sabor da fazenda. Pacote com aproximadamente 10 unidades.",
    "packageInfo": "Pacote 400g",
    "weight": 0.4,
    "isPackage": true
  },


  //Salgado P/ Fritar
    {
    "id": "20001",
    "name": "SALG FESTA COXINHA C/ REQUEIJAO PCT 50 UNID",
    "price": 18.3,
    "category": "Salgados P/ Fritar",
    "images": [
      "/products/20001.jpg"
    ],
    "description": "Coxinha C/ Requeijao congelado, tamanho festa. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
  {
    "id": "20002",
    "name": "SALG FESTA RICOTA COM AZEITONA PCT 50 UNID",
    "price": 18.3,
    "category": "Salgados P/ Fritar",
    "images": [
      "/products/20002.jpg"
    ],
    "description": "Ricota Com Azeitona congelado, tamanho festa. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
  {
    "id": "20003",
    "name": "SALG FESTA RISOLE DE CARNE PCT 50 UNID",
    "price": 18.3,
    "category": "Salgados P/ Fritar",
    "images": [
      "/products/20003.jpg"
    ],
    "description": "Risole De Carne congelado, tamanho festa. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
  {
    "id": "20004",
    "name": "SALG FESTA NAPOLITANO PCT 50 UNID",
    "price": 18.3,
    "category": "Salgados P/ Fritar",
    "images": [
      "/products/20004.jpg"
    ],
    "description": "Napolitano congelado, tamanho festa. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
  {
    "id": "20005",
    "name": "SALG FESTA CREME DE MILHO COM FRANGO PCT 50 UNID",
    "price": 18.3,
    "category": "Salgados P/ Fritar",
    "images": [
      "/products/20005.jpg"
    ],
    "description": "Creme De Milho Com Frango congelado, tamanho festa. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
  {
    "id": "20006",
    "name": "SALG FESTA KIBE TRADICIONAL PCT 50 UNID",
    "price": 18.3,
    "category": "Salgados P/ Fritar",
    "images": [
      "/products/20006.jpg"
    ],
    "description": "Kibe Tradicional congelado, tamanho festa. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
  {
    "id": "20007",
    "name": "SALG FESTA KIBE C/ CATUPIRY PCT 50 UNID",
    "price": 18.3,
    "category": "Salgados P/ Fritar",
    "images": [
      "/products/20007.jpg"
    ],
    "description": "Kibe C/ Catupiry congelado, tamanho festa. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
  {
    "id": "20008",
    "name": "SALG FESTA CARNE SECA C/ MANDIOCA PCT 50 UNID",
    "price": 18.3,
    "category": "Salgados P/ Fritar",
    "images": [
      "/products/20008.jpg"
    ],
    "description": "Carne Seca C/ Mandioca congelado, tamanho festa. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
  {
    "id": "20010",
    "name": "SALG FESTA RISOLE DE CAMARAO PCT 50 UNID",
    "price": 39.6,
    "category": "Salgados P/ Fritar",
    "images": [
      "/products/20010.jpg"
    ],
    "description": "Risole De Camarao congelado, tamanho festa. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
  {
    "id": "20012",
    "name": "SALG FESTA RISOLE DE BACALHAU PCT 50 UNID",
    "price": 39.6,
    "category": "Salgados P/ Fritar",
    "images": [
      "/products/20012.jpg"
    ],
    "description": "Risole De Bacalhau congelado, tamanho festa. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
  {
    "id": "20013",
    "name": "CHURROS DOCE DE LEITE PCT 50 UNID",
    "price": 18.3,
    "category": "Salgados P/ Fritar",
    "images": [
      "/products/20013.jpg"
    ],
    "description": "Churros Doce De Leite Pct 50 Unid congelado, tamanho festa. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true,
  },
  {
    "id": "20014",
    "name": "SALG FESTA COXINHA PCT 50 UNID",
    "price": 18.3,
    "category": "Salgados P/ Fritar",
    "images": [
      "/products/20014.jpg"
    ],
    "description": "Coxinha congelado, tamanho festa. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
  {
    "id": "20027",
    "name": "SALG FESTA ENR DE SALSICHA PCT 50 UNID",
    "price": 18.3,
    "category": "Salgados P/ Fritar",
    "images": [
      "/products/20027.jpg"
    ],
    "description": "Enr De Salsicha congelado, tamanho festa. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
  {
    "id": "20033",
    "name": "SALG FESTA RISOLE DE ALHO PCT 50 UNID",
    "price": 18.3,
    "category": "Salgados P/ Fritar",
    "images": [
      "/products/20033.jpg"
    ],
    "description": "Risole De Alho congelado, tamanho festa. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
  {
    "id": "20034",
    "name": "SALG FESTA RISOLE BOLIVIANO PCT 50 UNID",
    "price": 18.3,
    "category": "Salgados P/ Fritar",
    "images": [
      "/products/20034.jpg"
    ],
    "description": "Risole Boliviano congelado, tamanho festa. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
  {
    "id": "20035",
    "name": "SALG FESTA CROQUETE DE QUEIJO PCT 50 UNID",
    "price": 18.3,
    "category": "Salgados P/ Fritar",
    "images": [
      "/products/20035.jpg"
    ],
    "description": "Croquete De Queijo congelado, tamanho festa. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
  {
    "id": "20038",
    "name": "CHURROS DOCE DE CHOCOLATE PCT 50 UNID",
    "price": 18.3,
    "category": "Salgados P/ Fritar",
    "images": [
      "/products/20038.jpg"
    ],
    "description": "Churros Doce De Chocolate Pct 50 Unid congelado, tamanho festa. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true,
  },
  {
    "id": "20043",
    "name": "SALG FESTA RISOLE DE CALABRESA PCT 50 UNID",
    "price": 18.3,
    "category": "Salgados P/ Fritar",
    "images": [
      "/products/20043.jpg"
    ],
    "description": "Risole De Calabresa congelado, tamanho festa. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
  {
    "id": "20044",
    "name": "SALG FESTA KIBE C/ CREME DE ALHO PCT 50 UNID",
    "price": 18.3,
    "category": "Salgados P/ Fritar",
    "images": [
      "/products/20044.jpg"
    ],
    "description": "Kibe C/ Creme De Alho congelado, tamanho festa. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
  {
    "id": "50359",
    "name": "SALG FESTA RISOLE DE MILHO VERDE PCT 50 UNID",
    "price": 18.3,
    "category": "Salgados P/ Fritar",
    "images": [
      "/products/50359.jpg"
    ],
    "description": "Risole De Milho Verde congelado, tamanho festa. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
  {
    "id": "50572",
    "name": "SALG FESTA CARNE SECA C/ABOBORA PCT 50 UNID",
    "price": 18.3,
    "category": "Salgados P/ Fritar",
    "images": [
      "/products/50572.jpg"
    ],
    "description": "Carne Seca C/Abobora congelado, tamanho festa. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
  {
    "id": "50662",
    "name": "SALG FESTA RISOLE DE CHEDDAR PCT 50 UNID",
    "price": 18.3,
    "category": "Salgados P/ Fritar",
    "images": [
      "/products/50662.jpg"
    ],
    "description": "Risole De Cheddar congelado, tamanho festa. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
  {
    "id": "50647",
    "name": "MINI PASTEL DE FRANGO PCT 50 UNID",
    "price": 27.10,
    "category": "Salgados P/ Fritar",
    "images": [
      "/products/50647.jpg"
    ],
    "description": "Mini pastel de frango congelado, tamanho festa. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
  {
    "id": "50698",
    "name": "MINI PASTEL DE CARNE PCT 50 UNID",
    "price": 27.10,
    "category": "Salgados P/ Fritar",
    "images": [
      "/products/50698.jpg"
    ],
    "description": "Mini pastel de carne congelado, tamanho festa. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
  {
    "id": "50649",
    "name": "MINI PASTEL DE QUEIJO PCT 50 UNID",
    "price": 27.10,
    "category": "Salgados P/ Fritar",
    "images": [
      "/products/50649.jpg"
    ],
    "description": "Mini pastel de queijo congelado, tamanho festa. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
  
  // Salgados Assados 
  {
    "id": "20011",
    "name": "EMPADA DE FRANGO ASSADO PCT 50 UNID",
    "price": 25.00,
    "category": "Salgados Assados",
    "images": ["/products/20011.jpg"],
    "description": "Mini empada de frango assada. Pacote com 1kg.",
    "packageInfo": "Pacote 50un",
    "weight": 1.0,
    "isPackage": true
  },
  {
    "id": "50411",
    "name": "MINI ESFIRRA DE CARNE ASSADO PCT 50 UNID",
    "price": 32.70,
    "category": "Salgados Assados",
    "images": ["/products/50411.jpg"],
    "description": "Mini esfirra de carne assada. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
  {
    "id": "50410",
    "name": "MINI ENR DE SALSICHA ASSADO PCT 50 UNID",
    "price": 32.70,
    "category": "Salgados Assados",
    "images": ["/products/50410.jpg"],
    "description": "Mini enroladinho de salsicha assado. Pacote com 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
    {
    "id": "50409",
    "name": "MINI PAO PIZZA ASSADO PCT 50 UNID",
    "price": 32.70,
    "category": "Salgados Assados",
    "images": ["/products/50409.jpg"],
    "description": "Mini pao pizza. Pacote 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
    {
    "id": "50532",
    "name": "MINI ENR DE QUEIJO ASSADO PCT 50 UNID",
    "price": 32.70,
    "category": "Salgados Assados",
    "images": ["/products/50532.jpg"],
    "description": "Mini enroladinho de queijo. Pacote 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
    {
    "id": "50412",
    "name": "MINI ESFIRRA DE FRANGO ASSADO PCT 50 UNID",
    "price": 32.70,
    "category": "Salgados Assados",
    "images": ["/products/50412.jpg"],
    "description": "Mini esfirra de frango. Pacote 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
  {
    "id": "50533",
    "name": "MINI ROMEU E JULIETA ASSADO PCT 50 UNID",
    "price": 35.10,
    "category": "Salgados Assados",
    "images": ["/products/50533.jpg"],
    "description": "Mini romeu e julieta. Pacote 50 unidades.",
    "packageInfo": "Pacote 50un",
    "weight": 0.85,
    "isPackage": true
  },
  
  
  //PAO FRANCES
  {
    "id": "507468",
    "name": "PAO FRANCES 12 HORAS 70G PCT 1KG",
    "price": 7.70,
    "category": "Pães e Massas Doces",
    "images": [
      "/products/507468.jpg"
    ],
    "description": "Pão francês 12 horas 70g congelado. Pacote com aproximadamente 14 unidades.",
    "packageInfo": "Pacote",
    "weight": 1,
    "isPackage": true,
  },
  {
    "id": "40",
    "name": "PAO FRANCES 06 HORAS 70G PCT 1KG",
    "price": 7.70,
    "category": "Pães e Massas Doces",
    "images": [
      "/products/40.jpg"
    ],
    "description": "Pão francês 06 horas 70g congelado. Pacote com aproximadamente 14 unidades.",
    "packageInfo": "Pacote",
    "weight": 1,
    "isPackage": true,
    },
  // {
  //   "id": "431",
  //   "name": "PAO FRANCES 06 HORAS 70G PCT 3,5KG",
  //   "price": 24.85,
  //   "category": "Pães e Massas Doces",
  //   "images": [
  //     "/products/40.jpg"
  //   ],
  //   "description": "Pão francês 06 horas 70g congelado. Pacote com aproximadamente 50 unidades.",
  //   "packageInfo": "Pacote",
  //   "weight": 3.5,
  //   "isPackage": true,
  //   },
  // {
  //   "id": "430",
  //   "name": "PAO FRANCES 12 HORAS 70G PCT 3,5KG",
  //   "price": 24.85,
  //   "category": "Pães e Massas Doces",
  //   "images": [
  //     "/products/40.jpg"
  //   ],
  //   "description": "Pão francês 06 horas 70g congelado. Pacote com aproximadamente 50 unidades.",
  //   "packageInfo": "Pacote",
  //   "weight": 3.5,
  //   "isPackage": true,
  //   },
 
    // Massa doce
  {
    "id": "51",
    "name": "ROSCA TRANCADA 50G PCT 1KG",
    "price": 12.1,
    "category": "Pães e Massas Doces",
    "images": [
      "/products/51.jpg"
    ],
    "description": "Rosca trançada 50g. Pacote com aproximadamente 20 unidades. Tempo de fermentação 6 horas",
    "packageInfo": "Pacote",
    "weight": 1.0,
    "isPackage": true
  },
  {
    "id": "61",
    "name": "ROSCA CARACOL 50GR PCT 1KG",
    "price": 10.5,
    "category": "Pães e Massas Doces",
    "images": [
      "/products/61.jpg"
    ],
    "description": "Rosca caracol 50g. Pacote com aproximadamente 20 unidades. Tempo de fermentação 6 horas",
    "packageInfo": "Pacote",
    "weight": 1.0,
    "isPackage": true
  },
  {
    "id": "71",
    "name": "ROSCA TIPO HUNGARA 35GR PCT 1KG",
    "price": 13.7,
    "category": "Pães e Massas Doces",
    "images": [
      "/products/71.jpg"
    ],
    "description": "Rosca húngara 35g. Pacote com aproximadamente 29 unidades. Tempo de fermentação 6 horas",
    "packageInfo": "Pacote",
    "weight": 1.0,
    "isPackage": true
  },
  {
    "id": "41",
    "name": "PAO AMANTEIGADO 50GR PCT 1KG",
    "price": 10.5,
    "category": "Pães e Massas Doces",
    "images": [
      "/products/41.jpg"
    ],
    "description": "Pão amanteigado 50g. Pacote com aproximadamente 20 unidades. Tempo de fermentação 6 horas",
    "packageInfo": "Pacote",
    "weight": 1.0,
    "isPackage": true
  },
  {
    "id": "80",
    "name": "PAO MANDI 70G PCT 3,5KG",
    "price": 39.55,
    "category": "Pães e Massas Doces",
    "images": [
      "/products/80.jpg"
    ],
    "description": "Pão mandi 70g. Pacote com aproximadamente 50 unidades. Tempo de fermentação 6 horas",
    "packageInfo": "Pacote",
    "weight": 3.5,
    "isPackage": false
  },
  {
    "id": "81",
    "name": "PAO DE LEITE 50G PCT 3,5KG",
    "price": 35.35,
    "category": "Pães e Massas Doces",
    "images": [
      "/products/81.jpg"
    ],
    "description": "Pão de leite 50g. Pacote com aproximadamente 70 unidades. Tempo de fermentação 6 horas",
    "packageInfo": "Pacote",
    "weight": 3.5,
    "isPackage": false
  },
  {
    "id": "82",
    "name": "ROSCA CARACOL 50G PCT 3,5KG",
    "price": 35.35,
    "category": "Pães e Massas Doces",
    "images": [
      "/products/82.jpg"
    ],
    "description": "Rosca caracol 50g. Pacote com aproximadamente 70 unidades. Tempo de fermentação 6 horas",
    "packageInfo": "Pacote",
    "weight": 3.5,
    "isPackage": false
  },
  {
    "id": "83",
    "name": "PAO HOT DOG 73G PCT 3,5KG",
    "price": 35.35,
    "category": "Pães e Massas Doces",
    "images": [
      "/products/83.jpg"
    ],
    "description": "Pão de hot-dog 73g. Pacote com aproximadamente 48 unidades. Tempo de fermentação 6 horas",
    "packageInfo": "Pacote",
    "weight": 3.5,
    "isPackage": false
  },
  {
    "id": "84",
    "name": "PAO HAMBURGUER 65G PCT 3,5KG",
    "price": 35.35,
    "category": "Pães e Massas Doces",
    "images": [
      "/products/84.jpg"
    ],
    "description": "Pão de hambúrguer 65g. Pacote com aproximadamente 54 unidades. Tempo de fermentação 6 horas",
    "packageInfo": "Pacote",
    "weight": 3.5,
    "isPackage": false
  },
  {
    "id": "85",
    "name": "ROSCA TIPO HUNGARA 35G PCT 3,5KG",
    "price": 43.75,
    "category": "Pães e Massas Doces",
    "images": [
      "/products/85.jpg"
    ],
    "description": "Rosca húngara 35g. Pacote com aproximadamente 100 unidades. Tempo de fermentação 6 horas",
    "packageInfo": "Pacote",
    "weight": 3.5,
    "isPackage": false
  },
  {
    "id": "86",
    "name": "PAO AMANTEIGADO 50GR PCT 3,5KG",
    "price": 35.35,
    "category": "Pães e Massas Doces",
    "images": [
      "/products/86.jpg"
    ],
    "description": "Pão amanteigado 50g. Pacote com aproximadamente 70 unidades. Tempo de fermentação 6 horas",
    "packageInfo": "Pacote",
    "weight": 3.5,
    "isPackage": false
  },
  {
    "id": "87",
    "name": "PAO PALITO 75GR PCT 3,5KG",
    "price": 35.35,
    "category": "Pães e Massas Doces",
    "images": [
      "/products/87.jpg"
    ],
    "description": "Pão palito 75g. Pacote com aproximadamente 47 unidades. Tempo de fermentação 6 horas",
    "packageInfo": "Pacote",
    "weight": 3.5,
    "isPackage": false
  },
  {
    "id": "90",
    "name": "PAO DE MILHO 50GR PCT 1KG",
    "price": 10.5,
    "category": "Pães e Massas Doces",
    "images": [
      "/products/90.jpg"
    ],
    "description": "Pão de milho 50g. Pacote com aproximadamente 20 unidades. Tempo de fermentação 6 horas",
    "packageInfo": "Pacote",
    "weight": 1.0,
    "isPackage": true
  },
  {
    "id": "91",
    "name": "PAO BATATA 50GR PCT 1KG",
    "price": 13.7,
    "category": "Pães e Massas Doces",
    "images": [
      "/products/91.jpg"
    ],
    "description": "Pão de batata doce 50g. Pacote com aproximadamente 20 unidades. Tempo de fermentação 6 horas",
    "packageInfo": "Pacote",
    "weight": 1.0,
    "isPackage": true
  },
  {
    "id": "92",
    "name": "PAO MANDI 70GR PCT 1KG",
    "price": 12.1,
    "category": "Pães e Massas Doces",
    "images": [
      "/products/92.jpg"
    ],
    "description": "Pão mandi 70g. Pacote com aproximadamente 14 unidades. Tempo de fermentação 6 horas",
    "packageInfo": "Pacote",
    "weight": 1.0,
    "isPackage": true
  },
  {
    "id": "93",
    "name": "PAO DE LEITE 50G PCT 1KG",
    "price": 10.5,
    "category": "Pães e Massas Doces",
    "images": [
      "/products/93.jpg"
    ],
    "description": "Pão de leite 50g. Pacote com aproximadamente 20 unidades. Tempo de fermentação 6 horas",
    "packageInfo": "Pacote",
    "weight": 1.0,
    "isPackage": true
  },
  {
    "id": "96",
    "name": "ROSCA HUNGARA 70G PCT 3,5KG",
    "price": 43.75,
    "category": "Pães e Massas Doces",
    "images": [
      "/products/96.jpg"
    ],
    "description": "Rosca húngara 70g. Pacote com aproximadamente 50 unidades. Tempo de fermentação 6 horas",
    "packageInfo": "Pacote",
    "weight": 3.5,
    "isPackage": false
  },
  {
    "id": "97",
    "name": "PAO BATATA 50G PCT 3,5KG",
    "price": 43.75,
    "category": "Pães e Massas Doces",
    "images": [
      "/products/97.jpg"
    ],
    "description": "Pão de batata doce 50g. Pacote com aproximadamente 70 unidades. Tempo de fermentação 6 horas",
    "packageInfo": "Pacote",
    "weight": 3.5,
    "isPackage": false
  },
  {
    "id": "98",
    "name": "ROSCA TRANCADA 50G PCT 3,5KG",
    "price": 39.55,
    "category": "Pães e Massas Doces",
    "images": [
      "/products/98.jpg"
    ],
    "description": "Rosca trançada 50g. Pacote com aproximadamente 70 unidades. Tempo de fermentação 6 horas",
    "packageInfo": "Pacote",
    "weight": 3.5,
    "isPackage": false
  },
  {
    "id": "99",
    "name": "PAO DE MILHO 50GR PCT 3,5KG",
    "price": 35.35,
    "category": "Pães e Massas Doces",
    "images": [
      "/products/99.jpg"
    ],
    "description": "Pão de milho 50g. Pacote com aproximadamente 70 unidades. Tempo de fermentação 6 horas",
    "packageInfo": "Pacote",
    "weight": 3.5,
    "isPackage": false
  },
  
  //Salgado Assado G
  
  {
    "id": "50626",
    "name": "ESFIRRA DE CARNE GRANDE ASSADA PCT 10 UNID",
    "price": 49.50,
    "category": "Salgados Grandes",
    "images": ["/products/50626.jpg"],
    "description": "Esfirra de carne assada, tamanho grande. Pacote com 10 unidades.",
    "packageInfo": "Pacote 10un",
    "weight": 1.55,
    "isPackage": true
  },
  {
    "id": "50619",
    "name": "PRESUNTO E QUEIJO ASSADO G PCT 10 UNID",
    "price": 49.50,
    "category": "Salgados Grandes",
    "images": ["/products/50619.jpg"],
    "description": "Enroladinho presunto e queijo assado, tamanho grande. Pacote com 10 unidades.",
    "packageInfo": "Pacote 10un",
    "weight": 1.55,
    "isPackage": true
  },
  {
    "id": "50627",
    "name": "ENR QUEIJO ASSADO G PCT 10 UNID",
    "price": 49.50,
    "category": "Salgados Grandes",
    "images": ["/products/50627.jpg"],
    "description": "Enroladinho de queijo assado, tamanho grande. Pacote com 10 unidades.",
    "packageInfo": "Pacote 10un",
    "weight": 1.55,
    "isPackage": true
  },
  {
    "id": "50620",
    "name": "ENR SALSICHA C/ QUEIJO ASSADO G PCT 10 UNID",
    "price": 49.50,
    "category": "Salgados Grandes",
    "images": ["/products/50620.jpg"],
    "description": "Enroladinho de salsicha com queijo assado, tamanho grande. Pacote com 10 unidades.",
    "packageInfo": "Pacote 10un",
    "weight": 1.55,
    "isPackage": true
  },
  {
    "id": "50622",
    "name": "ENR SALSICHA C/ MOLHO ASSADO G PCT 10 UNID",
    "price": 49.50,
    "category": "Salgados Grandes",
    "images": ["/products/50622.jpg"],
    "description": "Enroladinho de salsicha com molho, tamanho grande. Pacote com 10 unidades.",
    "packageInfo": "Pacote 10un",
    "weight": 1.55,
    "isPackage": true
  },
  {
    "id": "50618",
    "name": "ROMEU E JULIETA ASSADO G PCT 10 UNID",
    "price": 49.50,
    "category": "Salgados Grandes",
    "images": ["/products/50618.jpg"],
    "description": "Enroladinho de Romeu e Julieta assado, tamanho grande. Pacote com 10 unidades.",
    "packageInfo": "Pacote 10un",
    "weight": 1.55,
    "isPackage": true
  },
  
  //Salgados Grandes P/ Fritar
  
  {
    "id": "20017",
    "name": "SALG G COXINHA 100G PCT 30 UNID",
    "price": 79.10,
    "category": "Salgados Grandes",
    "images": ["/products/20017.jpg"],
    "description": "Coxinha de frango tradicional p/ fritar congelada, tamanho grande (100g). Pacote com 30 unidades.",
    "packageInfo": "Pacote 30un",
    "weight": 3.0,
    "isPackage": true
  }, 
  {
    "id": "50004",
    "name": "SALG G ENR DE SALSICHA PCT 30 UNID",
    "price": 79.10,
    "category": "Salgados Grandes",
    "images": ["/products/50004.jpg"],
    "description": "Enroladinho de salsicha p/ fritar congelado, tamanho grande (100g). Pacote com 30 unidades.",
    "packageInfo": "Pacote 30un",
    "weight": 3.0,
    "isPackage": true
  },
  {
    "id": "50005",
    "name": "SALG G COXINHA C/ CATUPIRY 100G PCT 30 UNID",
    "price": 79.10,
    "category": "Salgados Grandes",
    "images": ["/products/50005.jpg"],
    "description": "Coxinha com requeijão p/ fritar congelado, tamanho grande (100g). Pacote com 30 unidades.",
    "packageInfo": "Pacote 30un",
    "weight": 3.0,
    "isPackage": true
  },
  {
    "id": "20020",
    "name": "SALG G FRITO KIBE CARNE 100G PCT 30 UNID",
    "price": 86.70,
    "category": "Salgados Grandes",
    "images": ["/products/20020.jpg"],
    "description": "Kibe com carne p/ fritar congelado, tamanho grande (100g). Pacote com 30 unidades.",
    "packageInfo": "Pacote 30un",
    "weight": 3.0,
    "isPackage": true
  },
  {
    "id": "20018",
    "name": "RISOLE DE CARNE GRANDE PCT 30 UNID",
    "price": 79.10,
    "category": "Salgados Grandes",
    "images": ["/products/20018.jpg"],
    "description": "Risole de carne p/ fritar congelado, tamanho grande (100g). Pacote com 30 unidades.",
    "packageInfo": "Pacote 30un",
    "weight": 3.0,
    "isPackage": true
  },
  {
    "id": "20019",
    "name": "SALG G NAPOLITANO 100G PCT 30 UNID",
    "price": 79.10,
    "category": "Salgados Grandes",
    "images": ["/products/20019.jpg"],
    "description": "Napolitano (presunto e queijo) p/ fritar congelado, tamanho grande (100g). Pacote com 30 unidades.",
    "packageInfo": "Pacote 30un",
    "weight": 3.0,
    "isPackage": true
  },
  
  //Pastelão G
  
  {
    "id": "50643",
    "name": "PASTELAO DE CARNE PCT 10 UNID",
    "price": 37.50,
    "category": "Salgados Grandes",
    "images": ["/products/50643.jpg"],
    "description": "Pastelão de carne p/ fritar congelado, tamanho grande. Pacote com 10 unidades.",
    "packageInfo": "Pacote 10un",
    "weight": 1.3,
    "isPackage": true
  },
  {
    "id": "507463",
    "name": "PASTELAO DE FRANGO PCT 10 UNID",
    "price": 37.50,
    "category": "Salgados Grandes",
    "images": ["/products/507463.jpg"],
    "description": "Pastelão de frango p/ fritar congelado, tamanho grande. Pacote com 10 unidades.",
    "packageInfo": "Pacote 10un",
    "weight": 1.3,
    "isPackage": true
  },
  {
    "id": "507465",
    "name": "PASTELAO DE APRESUNTADO C/QUEIJO PCT 10 UNID",
    "price": 37.50,
    "category": "Salgados Grandes",
    "images": ["/products/507465.jpg"],
    "description": "Pastelão de apresuntado c/queijo p/fritar congelado, tamanho grande. Pacote com 10 unidades.",
    "packageInfo": "Pacote 10un",
    "weight": 1.3,
    "isPackage": true
  },
  
  //BROA
  
  {
    "id": "10028",
    "name": "BROA TEMPERADA 35G PCT 1KG",
    "price": 16.90,
    "category": "Outros",
    "images": ["/products/10028.jpg"],
    "description": "Broa de fuba tamperada congelada, tamanho grande. Pacote com aproximadamente 28 unidades.",
    "packageInfo": "Pacote 1kg",
    "weight": 1.0,
    "isPackage": true
  },
  {
    "id": "50615",
    "name": "BROA DOCE 35G PCT 1KG",
    "price": 16.90,
    "category": "Outros",
    "images": ["/products/50615.jpg"],
    "description": "Broa de fuba doce congelada, tamanho grande. Pacote com aproximadamente 28 unidades.",
    "packageInfo": "Pacote 1kg",
    "weight": 1.0,
    "isPackage": true
  },
  
  // Biscoitos
  
  {
    "id": "10015",
    "name": "BISCOITO DE QUEIJO GG PCT 1KG",
    "price": 19.30,
    "category": "Biscoito de Queijo",
    "images": ["/products/10015.jpg"],
    "description": "Biscoito de queijo redondo (25g). Pacote com aproximadamente 40 unidades.",
    "packageInfo": "Pacote 1kg",
    "weight": 1.0,
    "isPackage": true
  },
  {
    "id": "50380",
    "name": "BISCOITO DE QUEIJO GG MEIA LUA PCT 1KG",
    "price": 19.30,
    "category": "Biscoito de Queijo",
    "images": ["/products/50380.jpg"],
    "description": "Biscoito de queijo meia lua (40g). Pacote com aproximadamente 25 unidades.",
    "packageInfo": "Pacote 1kg",
    "weight": 1.0,
    "isPackage": true
  },
  {
    "id": "10013",
    "name": "BISCOITO DE QUEIJO PALITO PCT 1KG",
    "price": 20.90,
    "category": "Biscoito de Queijo",
    "images": ["/products/10013.jpg"],
    "description": "Biscoito de queijo palito tamanho grande. Pacote com aproximadamente 12 unidades.",
    "packageInfo": "Pacote 1kg",
    "weight": 1.0,
    "isPackage": true
  },
  {
    "id": "50646",
    "name": "PÃO DE QUEIJO PALITO PCT 1KG",
    "price": 19.90,
    "category": "Pão de Queijo",
    "images": ["/products/50646.jpg"],
    "description": "Pão de queijo em formato de palito. Pacote com aproximadamente 14 unidades.",
    "packageInfo": "Pacote 1kg",
    "weight": 1.0,
    "isPackage": true
  },
  {
    "id": "507451",
    "name": "BISCOITO SUICO 40G PCT 1KG",
    "price": 19.10,
    "category": "Biscoito de Queijo",
    "images": ["/products/507451.jpg"],
    "description": "Biscoito de queijo suiço (40g). Pacote com aproximadamente 25 unidades.",
    "packageInfo": "Pacote 1kg",
    "weight": 1.0,
    "isPackage": true
  },
  
  {
    "id": "507450",
    "name": "BISCOITO SUICO 80G PCT 1KG",
    "price": 19.10,
    "category": "Biscoito de Queijo",
    "images": ["/products/507450.jpg"],
    "description": "Biscoito de queijo suiço (80g). Pacote com aproximadamente 12 unidades.",
    "packageInfo": "Pacote 1kg",
    "weight": 1.0,
    "isPackage": true
  },
  {
    "id": "19",
    "name": "BISCOITO SUICO MEIA LUA 60G PCT 2KG",
    "price": 38.20,
    "category": "Biscoito de Queijo",
    "images": ["/products/19.jpg"],
    "description": "Biscoito de queijo suiço meia lua (60g). Pacote com aproximadamente 33 unidades.",
    "packageInfo": "Pacote 2kg",
    "weight": 2.0,
    "isPackage": false
  },
    {
    "id": "50667",
    "name": "BISCOITO 4 QUEIJO PALITO 40G PCT 1KG",
    "price": 20.90,
    "category": "Biscoito de Queijo",
    "images": ["/products/50667.jpg"],
    "description": "Biscoito 4 queijos(40g). Pacote com aproximadamente 25 unidades.",
    "packageInfo": "Pacote 1kg",
    "weight": 1.0,
    "isPackage": true
  },
    {
    "id": "50668",
    "name": "BISCOITO 4 QUEIJO MEIA LUA 60G PCT 2KG",
    "price": 41.80,
    "category": "Biscoito de Queijo",
    "images": ["/products/50668.png"],
    "description": "Biscoito 4 queijos(60g). Pacote com aproximadamente 33 unidades.",
    "packageInfo": "Pacote 2kg",
    "weight": 2.0,
    "isPackage": false
  },
      {
    "id": "50007",
    "name": "CHIPA PCT 1KG",
    "price": 19.00,
    "category": "Biscoito de Queijo",
    "images": ["/products/50007.jpg"],
    "description": "Chipa (40g). Pacote com aproximadamente 25 unidades.",
    "packageInfo": "Pacote 1kg",
    "weight": 1.0,
    "isPackage": true
  },
  
      {
    "id": "10014",
    "name": "BISC PALITO PREMIUM 40G 1KG",
    "price": 22.99,
    "category": "Biscoito de Queijo",
    "images": ["/products/10014.jpg"],
    "description": "Biscoito de queijo premium (40g). Pacote com aproximadamente 25 unidades.",
    "packageInfo": "Pacote 1kg",
    "weight": 1.0,
    "isPackage": true
  },
  
  
  
  //Recheados Gourmet
  
  {
    "id": "621",
    "name": "PAO RECHEADO GOURMET DE GOIABADA PCT 400G",
    "price": 16.40,
    "category": "Pão de Queijo",
    "images": ["/products/621.jpg"],
    "description": "Pão de queijo recheado com goiabada. Pacote com aproximadamente 12 unidades.",
    "packageInfo": "Pacote 400g",
    "weight": 0.4,
    "isPackage": true
  },
  {
    "id": "622",
    "name": "PAO RECHEADO GOURMET DE CALABRESA PCT 400G",
    "price": 16.40,
    "category": "Pão de Queijo",
    "images": ["/products/622.jpg"],
    "description": "Pão de queijo recheado com calabresa e azeitona. Pacote com aproximadamente 12 unidades.",
    "packageInfo": "Pacote 400g",
    "weight": 0.4,
    "isPackage": true
  },
  {
    "id": "623",
    "name": "PAO RECHEADO GOURMET DE FRANGO PCT 400G",
    "price": 16.40,
    "category": "Pão de Queijo",
    "images": ["/products/623.jpg"],
    "description": "Pão de queijo recheado com FRANGO. Pacote com aproximadamente 12 unidades.",
    "packageInfo": "Pacote 400g",
    "weight": 0.4,
    "isPackage": true
  },
  {
    "id": "10",
    "name": "PAO RECHEADO GOURMET DE GOIABADA PCT 1KG",
    "price": 39.50,
    "category": "Pão de Queijo",
    "images": ["/products/10.jpg"],
    "description": "Pão de queijo recheado com goiabada. Pacote com aproximadamente 30 unidades.",
    "packageInfo": "Pacote 1kg",
    "weight": 1.0,
    "isPackage": true
  },
  {
    "id": "11",
    "name": "PAO RECHEADO GOURMET DE FRANGO PCT 1KG",
    "price": 39.50,
    "category": "Pão de Queijo",
    "images": ["/products/11.jpg"],
    "description": "Pão de queijo recheado com frango. Pacote com aproximadamente 30 unidades.",
    "packageInfo": "Pacote 1kg",
    "weight": 1.0,
    "isPackage": true
  },
  {
    "id": "507469",
    "name": "PAO RECHEADO GOURMET DE CALABRESA PCT 1KG",
    "price": 39.50,
    "category": "Pão de Queijo",
    "images": ["/products/507469.jpg"],
    "description": "Pão de queijo recheado com calabresa e azeitona. Pacote com aproximadamente 30 unidades.",
    "packageInfo": "Pacote 1kg",
    "weight": 1.0,
    "isPackage": true
  },

  //Recheados Tradicional

  {
    "id": "50573",
    "name": "PAO DE QUEIJO RECHEADO COM CARNE PCT 1KG",
    "price": 29.20,
    "category": "Pão de Queijo",
    "images": ["/products/rec.jpg"],
    "description": "Pão de queijo recheado com carne. Pacote com aproximadamente 40 unidades.",
    "packageInfo": "Pacote 1kg",
    "weight": 1.0,
    "isPackage": true
  },
  {
    "id": "50520",
    "name": "PAO DE QUEIJO RECHEADO COM FRANGO PCT 1KG",
    "price": 29.20,
    "category": "Pão de Queijo",
    "images": ["/products/rec.jpg"],
    "description": "Pão de queijo recheado com frango. Pacote com aproximadamente 40 unidades.",
    "packageInfo": "Pacote 1kg",
    "weight": 1.0,
    "isPackage": true
  },
  {
    "id": "50655",
    "name": "PAO DE QUEIJO RECHEADO COM GOIABADA PCT 1K",
    "price": 29.20,
    "category": "Pão de Queijo",
    "images": ["/products/rec.jpg"],
    "description": "Pão de queijo recheado com goiabada. Pacote com aproximadamente 40 unidades.",
    "packageInfo": "Pacote 1kg",
    "weight": 1.0,
    "isPackage": true
  },
  {
    "id": "50611",
    "name": "PAO DE QUEIJO RECHEADO COM LINGUICA APIMENTADA PCT 1KG",
    "price": 29.20,
    "category": "Pão de Queijo",
    "images": ["/products/rec.jpg"],
    "description": "Pão de queijo recheado com linguiça apimentada. Pacote com aproximadamente 40 unidades.",
    "packageInfo": "Pacote 1kg",
    "weight": 1.0,
    "isPackage": true
  },

  {
    "id": "3000",
    "name": "ALHO EM CREME COM TRADICIONAL OMG POTE 200G",
    "price": 12.00,
    "category": "Alho em creme",
    "images": [`https://lh6.googleusercontent.com/proxy/cP5TQ4Hwy0wNUgsmbaUESquad7wj43zxuF-F7Oea01MX6JGf6FaFh2pC-6jmqamIuZsbkwxyLhyyRaR_5hwlkTYZT6peZE4fUNbDzurWnC_-V-0BaVbcPg`],
    "description": "Revolucione sua cozinha com o 1º alho em creme do mundo. Pronto para temperar, servir e combinar com tudo. Zero glúten, lactose, corante e colesterol. Sem gordura hidrogenada.",
    "packageInfo": "Pacote 200g",
    "weight": 0.200,
    "isPackage": true,
  },
  {
    "id": "3200",
    "name": "ALHO EM CREME COM ERVAS FINAS OMG POTE 200G",
    "price": 12.00,
    "category": "Alho em creme",
    "images": [`https://cdn-cosmos.bluesoft.com.br/products/7898960765052`],
    "description": "Revolucione sua cozinha com o 1º alho em creme do mundo. Pronto para temperar, servir e combinar com tudo. Zero glúten, lactose, corante e colesterol. Sem gordura hidrogenada.",
    "packageInfo": "Pacote 200g",
    "weight": 0.200,
    "isPackage": true,
  },
  {
    "id": "3100",
    "name": "ALHO EM CREME COM CEBOLA OMG POTE 200G",
    "price": 12.00,
    "category": "Alho em creme",
    "images": [`https://cdn-cosmos.bluesoft.com.br/products/7898960765038`],
    "description": "Revolucione sua cozinha com o 1º alho em creme do mundo. Pronto para temperar, servir e combinar com tudo. Zero glúten, lactose, corante e colesterol. Sem gordura hidrogenada.",
    "packageInfo": "Pacote 200g",
    "weight": 0.200,
    "isPackage": true,
  },
  {
    "id": "3300",
    "name": "ALHO EM CREME COM PIMENTA CALABRESA OMG POTE 200G",
    "price": 12.00,
    "category": "Alho em creme",
    "images": [`https://cdn-cosmos.bluesoft.com.br/products/7898960765045`],
    "description": "Revolucione sua cozinha com o 1º alho em creme do mundo. Pronto para temperar, servir e combinar com tudo. Zero glúten, lactose, corante e colesterol. Sem gordura hidrogenada.",
    "packageInfo": "Pacote 200g",
    "weight": 0.200,
    "isPackage": true,
  },


    // Outras categorias - mantendo os produtos existentes
];
