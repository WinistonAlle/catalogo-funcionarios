
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { formatCPF, formatCEP, fetchAddressFromCEP, createFullAddress } from '@/utils/formatUtils';
import { toast } from './ui/sonner';

interface NewCustomerFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  onExistingCustomer: () => void;
}

const formSchema = z.object({
  name: z.string().min(3, { message: "Nome deve ter pelo menos 3 caracteres" }),
  cpf: z.string().min(11, { message: "CPF deve ter 11 dígitos" }).max(14),
  zipCode: z.string().min(8, { message: "CEP deve ter 8 dígitos" }).max(9),
  address: z.string().min(5, { message: "Endereço deve ter pelo menos 5 caracteres" }),
  number: z.string().min(1, { message: "Número é obrigatório" }),
  complement: z.string().optional(),
  district: z.string().optional(),
  city: z.string().min(2, { message: "Cidade deve ter pelo menos 2 caracteres" }),
  state: z.string().min(2, { message: "Estado deve ter pelo menos 2 caracteres" }),
  referralSource: z.string({ required_error: "Selecione como nos conheceu" }),
});

const NewCustomerForm: React.FC<NewCustomerFormProps> = ({ isOpen, onClose, onSubmit, onExistingCustomer }) => {
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      cpf: "",
      zipCode: "",
      address: "",
      number: "",
      complement: "",
      district: "",
      city: "",
      state: "",
      referralSource: "",
    },
  });
  
  const handleSubmit = (data: z.infer<typeof formSchema>) => {
    // Format CPF without the mask for submission
    const formattedCPF = data.cpf.replace(/\D/g, '');
    
    // Create full address that combines street, number, complement, district, city and state
    const fullAddress = createFullAddress(
      data.address,
      data.number,
      data.complement,
      data.district,
      data.city,
      data.state
    );
    
    // Submit the form data with formatted values
    onSubmit({
      name: data.name,
      cpf: formattedCPF,
      address: fullAddress,
      zipCode: data.zipCode.replace(/\D/g, ''),
      referralSource: data.referralSource,
    });
  };

  const lookupAddressFromCEP = async (cep: string) => {
    if (!cep || cep.replace(/\D/g, '').length !== 8) return;

    try {
      setIsLoadingAddress(true);
      const addressData = await fetchAddressFromCEP(cep);
      
      if (addressData.erro) {
        toast.error("Endereço não encontrado para o CEP informado.");
        return;
      }
      
      // Update form fields
      form.setValue("address", addressData.logradouro || '');
      form.setValue("district", addressData.bairro || '');
      form.setValue("city", addressData.localidade || '');
      form.setValue("state", addressData.uf || '');
      
      // Focus on the number field after the address is filled
      setTimeout(() => {
        document.getElementById("number-field")?.focus();
      }, 100);
      
    } catch (error) {
      toast.error("Erro ao buscar endereço. Tente novamente.");
      console.error("Error fetching address:", error);
    } finally {
      setIsLoadingAddress(false);
    }
  };
  
  // This is the first question dialog "É sua primeira compra?"
  if (!isOpen) {
    return (
      <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>É sua primeira compra?</DialogTitle>
          </DialogHeader>
          <div className="flex gap-3 justify-center mt-4">
            <Button 
              onClick={onExistingCustomer}
              className="bg-red-600 hover:bg-red-700"
            >
              Não
            </Button>
            <Button 
              variant="outline"
              onClick={() => onSubmit(true)}
            >
              Sim
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  
  // This is the actual form for new customers
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Dados do Cliente</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome Completo</FormLabel>
                  <FormControl>
                    <Input placeholder="Digite seu nome completo" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="cpf"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CPF</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="000.000.000-00" 
                      value={field.value}
                      onChange={(e) => {
                        // Format as CPF
                        const rawValue = e.target.value.replace(/\D/g, '');
                        const formattedValue = formatCPF(rawValue);
                        field.onChange(formattedValue);
                      }}
                      maxLength={14}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="zipCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CEP</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="00000-000" 
                      value={field.value}
                      onChange={(e) => {
                        // Format as CEP
                        const rawValue = e.target.value.replace(/\D/g, '');
                        const formattedValue = formatCEP(rawValue);
                        field.onChange(formattedValue);
                        
                        // Auto lookup address if CEP is complete
                        if (rawValue.length === 8) {
                          lookupAddressFromCEP(rawValue);
                        }
                      }}
                      maxLength={9}
                      disabled={isLoadingAddress}
                    />
                  </FormControl>
                  {isLoadingAddress && (
                    <p className="text-xs text-gray-500">Buscando endereço...</p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Endereço</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Rua, número" 
                      {...field} 
                      disabled={isLoadingAddress}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* New number and complement fields side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número</FormLabel>
                    <FormControl>
                      <Input 
                        id="number-field"
                        placeholder="Número" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="complement"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Complemento</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Apto, bloco, casa..." 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="district"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bairro</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Bairro" 
                        {...field} 
                        disabled={isLoadingAddress}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cidade</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Cidade" 
                        {...field} 
                        disabled={isLoadingAddress}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="state"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Estado" 
                      {...field} 
                      disabled={isLoadingAddress}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="referralSource"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Como nos conheceu</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma opção" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Instagram">Instagram</SelectItem>
                      <SelectItem value="Facebook">Facebook</SelectItem>
                      <SelectItem value="Indicação">Indicação</SelectItem>
                      <SelectItem value="Google">Google</SelectItem>
                      <SelectItem value="Outros">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex justify-end pt-4">
              <Button 
                variant="outline" 
                onClick={onExistingCustomer}
                className="mr-2"
                type="button"
              >
                Cancelar
              </Button>
              <Button 
                type="submit"
                className="bg-red-600 hover:bg-red-700"
              >
                Confirmar
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default NewCustomerForm;
