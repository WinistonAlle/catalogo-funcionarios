
import { Kit } from '@/types/products';
import { PRODUCTS } from './products';

// Sample kit data
export const KITS: Kit[] = [
  {
    id: 'kit1',
    name: 'Kit Café da Manhã',
    description: 'Um café da manhã completo com sabor de padaria! Pão francês, rosca doce, pão de queijo premium, broa, biscoito meia lua e enroladinho de queijo. Ideal para consumo familiar ou revenda.',
    image: '/kits/kit-cafe-manha.png',
    items: [
      { productId: '40', quantity: 1 }, // PAO FRANCES 6 HORAS 70 G PCT 1KG
      { productId: '71', quantity: 1 }, // ROSCA TIPO HUNGARA 35GR PCT 1K
      { productId: '10010', quantity: 2 }, // PAO DE QUEIJO PREMIUM 30G PCT 1KG (x2)
      { productId: '50532', quantity: 1 }, // MINI ENR DE QUEIJO ASSADO PCT 50 UNID (closest to enroladinho de queijo)
      { productId: '50380', quantity: 1 }, // BISCOITO GG MEIA LUA 40G PCT 1KG
      { productId: '50615', quantity: 1 }, // BROA DOCE 35G PCT 1KG
    ]
  },
  {
    id: 'kit2',
    name: 'Kit Festinha 30 Pessoas',
    description: 'Serve até 30 convidados com variedade e praticidade! Salgadinhos tradicionais + um churros delicioso.', //Agora com nosso creme de alho OMG de ervas finas para acompanhar com muito sabor!
    image: '/kits/kit-festinha.png',
    items: [
      { productId: '20014', quantity: 1 }, // SALG FESTA COXINHA PCT 50 UNID (Coxinha tradicional)
      { productId: '20035', quantity: 1 }, // SALG FESTA CROQUETE DE QUEIJO PCT 50 UNID
      { productId: '20003', quantity: 1 }, // SALG FESTA RISOLE DE CARNE PCT 50 UNID
      { productId: '20027', quantity: 1 }, // SALG FESTA ENR DE SALSICHA PCT 50 UNID
      { productId: '20007', quantity: 1 }, // KIBE C/ REQUEIJÃO PCT 50 UNID
      { productId: '20013', quantity: 1 }, // CHURROS DOCE DE LEITE PCT 50 UNID
      //{ productId: '3200', quantity: 1 }, // ALHO EM CREME C/ ERVAS FINAS OMG POTE 200G
    ]
  },
  {
    id: 'kit3',
    name: 'Kit Festinha 50 Pessoas',
    description: 'Um kit completo para quem vai receber até 50 convidados! Salgadinhos variados, pra dar aquele toque especial no seu evento.', //+ dois potes do creme de alho OMG, um com ervas finas e outro com pimenta calabresa, pra dar aquele toque especial no seu evento.
    image: '/kits/kit-festa50.png',
    items: [
      { productId: '20014', quantity: 1 }, // SALG FESTA COXINHA PCT 50 UNID (Coxinha tradicional)
      { productId: '20035', quantity: 1 }, // SALG FESTA CROQUETE DE QUEIJO PCT 50 UNID
      { productId: '20003', quantity: 1 }, // SALG FESTA RISOLE DE CARNE PCT 50 UNID
      { productId: '20027', quantity: 1 }, // SALG FESTA ENR DE SALSICHA PCT 50 UNID
      { productId: '20007', quantity: 1 }, // KIBE C/ REQUEIJÃO PCT 50 UNID
      { productId: '20043', quantity: 1 }, // SALG FESTA RISOLE DE CALABRESA PCT 50 UNID
      { productId: '20001', quantity: 1 }, // SALG FESTA COXINHA C/ REQUEIJAO PCT 50 UNID (closest to coxinha com catupiry)
      { productId: '20004', quantity: 1 }, // SALG FESTA NAPOLITANO PCT 50 UNID
      { productId: '20038', quantity: 1 }, // CHURROS DOCE DE CHOCOLATE PCT 50 UNID
      { productId: '20013', quantity: 1 }, // CHURROS DOCE DE LEITE PCT 50 UNID
     // { productId: '3200', quantity: 1 }, // ALHO EM CREME C/ ERVAS FINAS OMG POTE 200G
     // { productId: '3300', quantity: 1 }, // ALHO EM CREME C/ PIMENTA CALABRESA OMG POTE 200G
    ]
  },
  {
    id: 'kit4',
    name: 'Kit Degustação',
    description: 'O combo ideal para quem quer experimentar variedade com muito sabor! Uma combinação dos nossos melhores pães e biscoitos.', // e o famoso creme de alho OMG de ervas finas. Ideal para primeira compra ou clientes curiosos!'
    image: '/kits/kit-degustacao.png',
    items: [
      { productId: '50407', quantity: 2 }, // PAO DE QUEIJO GM 25G PCT 800G (equivalent to 2x 400g packs)
      { productId: '50706', quantity: 1 }, // PAO DE TAPIOCA COM QUEIJO PCT 400G
      { productId: '50402', quantity: 1 }, // BISCOITO DE QUEIJO SF 40G PCT 800G
      { productId: '50404', quantity: 1 }, // QUEBRADOR DE QUEIJO SF 20G PCT 800G
      { productId: '50709', quantity: 1 }, // PALITO DE QUEIJO GOURMET PCT 400G
      //{ productId: '3200', quantity: 1 }, // ALHO EM CREME C/ ERVAS FINAS OMG POTE 200G
    ]
  }
];

// Helper function to get product details for a kit
export const getKitDetails = (kitId: string) => {
  const kit = KITS.find(k => k.id === kitId);
  if (!kit) return null;
  
  const items = kit.items.map(item => {
    const product = PRODUCTS.find(p => p.id === item.productId);
    return {
      product,
      quantity: item.quantity
    };
  }).filter(item => item.product !== undefined);
  
  const totalPrice = items.reduce((sum, item) => 
    sum + ((item.product?.price || 0) * item.quantity), 0);
  
  const totalWeight = items.reduce((sum, item) => 
    sum + ((item.product?.weight || 0) * item.quantity), 0);
  
  return {
    ...kit,
    items,
    totalPrice,
    totalWeight
  };
};
