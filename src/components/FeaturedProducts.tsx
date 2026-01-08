
import React from 'react';
import { Product } from '@/types/products';
import ProductCard from './ProductCard';
import { 
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { useIsMobile } from '@/hooks/use-mobile';

interface FeaturedProductsProps {
  title: string;
  products: Product[];
  description?: string;
  showFeatured?: boolean;
  autoplay?: boolean;
}

const FeaturedProducts: React.FC<FeaturedProductsProps> = ({ 
  title, 
  products,
  description,
  showFeatured = true,
  autoplay = false
}) => {
  const isMobile = useIsMobile();
  
  if (products.length === 0 || !showFeatured) return null;
  
  // Calculate card widths based on screen size
  // Reduced width to allow partial view of next card (Netflix style)
  const cardWidth = isMobile ? 80 : 65; // percentage of container width
  
  return (
    <div className="mt-6 px-4">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">{title}</h2>
          {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
        </div>
      </div>
      
      <div className="relative">
        <Carousel
          opts={{
            align: "center",
            loop: products.length > 3,
            containScroll: "trimSnaps",
          }}
          autoplay={autoplay} // Enable autoplay for specific carousels
          autoplayDelay={5000} // 5 seconds delay between slides
          autoplayPauseOnInteraction={true} // Pause on user interaction
          className="w-full"
        >
          <CarouselContent className="-ml-2 md:-ml-4">
            {products.map(product => (
              <CarouselItem 
                key={product.id} 
                className={`pl-2 md:pl-4`}
                style={{ width: `${cardWidth}%` }} // Dynamic width based on screen size
              >
                <ProductCard product={product} />
              </CarouselItem>
            ))}
          </CarouselContent>
          
          {/* Navigation Arrows - Improved Netflix-style with better visibility */}
          <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between z-10 pointer-events-none">
            <CarouselPrevious className="relative -translate-y-1/2 h-12 w-12 opacity-100 pointer-events-auto bg-red-600 hover:bg-red-700 text-white border-none shadow-lg" />
            <CarouselNext className="relative -translate-y-1/2 h-12 w-12 opacity-100 pointer-events-auto bg-red-600 hover:bg-red-700 text-white border-none shadow-lg" />
          </div>
        </Carousel>
        
        {/* Gradient indicators for adjacent products (Netflix style) */}
        <div className="absolute left-0 top-0 bottom-0 w-16 h-full bg-gradient-to-r from-white/90 to-transparent pointer-events-none"></div>
        <div className="absolute right-0 top-0 bottom-0 w-16 h-full bg-gradient-to-l from-white/90 to-transparent pointer-events-none"></div>
      </div>
    </div>
  );
};

export default FeaturedProducts;
