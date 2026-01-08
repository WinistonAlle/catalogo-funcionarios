
import { Product } from '@/types/products';
import { PRODUCTS } from './products';

// Add featured flag and extra info to selected products
export const getFeaturedProducts = (): Product[] => {
  // Find the Oh My Garlic product and add extra info
  const ohmyGarlic = PRODUCTS.find(p => p.name.includes('Bolo de Chocolate'));
  if (ohmyGarlic) {
    ohmyGarlic.featured = true;
    ohmyGarlic.extraInfo = {
      usageTips: "Perfeito para sobremesa após uma refeição ou para acompanhar um café à tarde. Você também pode aquecer levemente para uma experiência melhor.",
      ingredients: "Chocolate, farinha, açúcar, ovos, manteiga, leite e fermento.",
      funFact: "Estudos mostram que o chocolate amargo contém antioxidantes que podem ajudar a reduzir o estresse e melhorar o humor."
    };
  }
  
  // Select some top products as featured
  const featuredProducts = PRODUCTS.map(product => {
    if (['1', '2', '4', '9'].includes(product.id)) {
      return {
        ...product,
        featured: true
      };
    }
    return product;
  });
  
  return featuredProducts.filter(product => product.featured);
};

export const FEATURED_PRODUCTS = getFeaturedProducts();

export const WEEKLY_TOP = FEATURED_PRODUCTS.slice(0, 5);
