
/**
 * Formats a string as a CPF (Brazilian ID) with mask: 000.000.000-00
 */
export const formatCPF = (value: string): string => {
  // Remove any non-digit character
  const digits = value.replace(/\D/g, '');
  
  if (digits.length <= 3) {
    return digits;
  } else if (digits.length <= 6) {
    return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  } else if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  } else {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  }
};

/**
 * Formats a string as a CEP (Brazilian ZIP code) with mask: 00000-000
 */
export const formatCEP = (value: string): string => {
  // Remove any non-digit character
  const digits = value.replace(/\D/g, '');
  
  if (digits.length <= 5) {
    return digits;
  } else {
    return `${digits.slice(0, 5)}-${digits.slice(5, 8)}`;
  }
};

/**
 * Fetches address information from a CEP using the ViaCEP API
 */
export const fetchAddressFromCEP = async (cep: string): Promise<{
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}> => {
  // Remove any non-digit character
  const digits = cep.replace(/\D/g, '');
  
  if (digits.length !== 8) {
    throw new Error('CEP deve ter 8 dígitos');
  }
  
  const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  return response.json();
};

/**
 * Creates a full address string combining address components
 */
export const createFullAddress = (
  address: string,
  number: string,
  complement?: string,
  district?: string,
  city?: string,
  state?: string
): string => {
  let fullAddress = address;
  
  // Add number (required)
  if (number) {
    fullAddress += `, ${number}`;
  }
  
  // Add complement (optional)
  if (complement && complement.trim() !== '') {
    fullAddress += `, ${complement.trim()}`;
  }
  
  // Add district (optional)
  if (district && district.trim() !== '') {
    fullAddress += `, ${district.trim()}`;
  }
  
  // Add city and state (optional)
  if (city && state) {
    fullAddress += `, ${city}/${state}`;
  }
  
  return fullAddress;
};
