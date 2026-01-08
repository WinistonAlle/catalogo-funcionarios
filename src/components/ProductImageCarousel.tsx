
import React, { useState } from 'react';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";

interface ProductImageCarouselProps {
  images: string[];
  productName: string;
  className?: string;
}

const ProductImageCarousel: React.FC<ProductImageCarouselProps> = ({
  images,
  productName,
  className
}) => {
  const [imageError, setImageError] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>, index: number) => {
    setImageError(prev => ({...prev, [index]: true}));
    e.currentTarget.src = "/placeholder.svg"; // Default image if product image fails to load
  };

  const handleImageLoad = (index: number) => {
    setLoading(prev => ({...prev, [index]: false}));
  };

  if (images.length === 0) {
    return (
      <div className={cn("relative aspect-square overflow-hidden bg-gray-100", className)}>
        <img
          src="/placeholder.svg"
          alt={productName}
          className="object-cover w-full h-full"
        />
      </div>
    );
  }

  if (images.length === 1) {
    return (
      <div className={cn("relative aspect-square overflow-hidden bg-gray-100", className)}>
        <div className={loading[0] ? "animate-pulse bg-gray-200 absolute inset-0" : "hidden"} />
        <img
          src={images[0]}
          alt={productName}
          onError={(e) => handleImageError(e, 0)}
          onLoad={() => handleImageLoad(0)}
          className="object-cover w-full h-full"
        />
      </div>
    );
  }

  const validImages = images.filter((_, index) => !imageError[index]);
  
  if (validImages.length === 0) {
    return (
      <div className={cn("relative aspect-square overflow-hidden bg-gray-100", className)}>
        <img
          src="/placeholder.svg"
          alt={productName}
          className="object-cover w-full h-full"
        />
      </div>
    );
  }

  return (
    <Carousel className={cn("w-full", className)}>
      <CarouselContent>
        {images.map((image, index) => (
          <CarouselItem key={index} className="aspect-square">
            <div className="relative aspect-square overflow-hidden bg-gray-100">
              <div className={loading[index] !== false ? "animate-pulse bg-gray-200 absolute inset-0" : "hidden"} />
              <img
                src={image}
                alt={`${productName} - ${index + 1}`}
                onError={(e) => handleImageError(e, index)}
                onLoad={() => handleImageLoad(index)}
                className="object-cover w-full h-full"
              />
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      {/* Updated navigation arrows to be more visible */}
      <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between pointer-events-none">
        <CarouselPrevious className="relative -translate-y-1/2 h-10 w-10 opacity-90 shadow-md pointer-events-auto" />
        <CarouselNext className="relative -translate-y-1/2 h-10 w-10 opacity-90 shadow-md pointer-events-auto" />
      </div>
    </Carousel>
  );
};

export default ProductImageCarousel;
