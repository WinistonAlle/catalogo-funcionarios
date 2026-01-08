import React from "react";
import { Search } from "lucide-react";

type Props = {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  selectedCategory: string | "all";
  setSelectedCategory: (value: string | "all") => void;
  categories: string[];
};

const SearchBar: React.FC<Props> = ({
  searchTerm,
  setSearchTerm,
  selectedCategory,
  setSelectedCategory,
  categories,
}) => {
  return (
    <div
      className="
        w-full rounded-2xl p-4 shadow-md
        bg-white/60 backdrop-blur-xl
        border border-white/30
        flex flex-col gap-4
      "
    >
      {/* Campo de busca */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nome ou código..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="
            w-full pl-12 pr-4 py-3
            rounded-full
            bg-white/70 backdrop-blur-md 
            border border-gray-200
            shadow-inner
            text-sm md:text-base
            focus:outline-none focus:ring-2 focus:ring-red-500
          "
        />
      </div>

      {/* Categorias */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {/* Todas */}
        <button
          type="button"
          onClick={() => setSelectedCategory("all")}
          className={`
            px-4 py-2 rounded-full text-sm whitespace-nowrap transition
            ${
              selectedCategory === "all"
                ? "bg-red-600 text-white shadow-md"
                : "bg-white/70 backdrop-blur-md text-gray-700 border border-gray-300"
            }
          `}
        >
          Todas
        </button>

        {/* Demais categorias */}
        {categories.map((cat) => {
          const isActive = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(isActive ? "all" : cat)}
              className={`
                px-4 py-2 rounded-full text-sm whitespace-nowrap transition
                ${
                  isActive
                    ? "bg-red-600 text-white shadow-md"
                    : "bg-white/70 backdrop-blur-md text-gray-700 border border-gray-300"
                }
              `}
            >
              {cat || "Sem categoria"}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SearchBar;
