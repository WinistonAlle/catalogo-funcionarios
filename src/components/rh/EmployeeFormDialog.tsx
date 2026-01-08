import { useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { upsertEmployee, Employee } from "@/lib/employeeService";
import { z } from "zod";
import { toast } from "sonner";

const schema = z.object({
  id: z.string().optional(),
  cpf: z
    .string()
    .min(11, "CPF deve ter ao menos 11 dígitos")
    .regex(/^\d+$/, "Use apenas números no CPF"),
  full_name: z.string().min(2, "Nome obrigatório"),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  department: z.string().optional().or(z.literal("")),
  job_title: z.string().optional().or(z.literal("")),
  hired_at: z.string().optional().or(z.literal("")), // ISO (yyyy-mm-dd) ou vazio
  notes: z.string().optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

export default function EmployeeFormDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Employee;
  onSuccess?: () => void;
}) {
  const { open, onOpenChange, initial, onSuccess } = props;

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<FormValues>({
    defaultValues: {
      cpf: "",
      full_name: "",
      email: "",
      phone: "",
      department: "",
      job_title: "",
      hired_at: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (!open) return;

    if (initial) {
      reset({
        id: initial.id,
        cpf: initial.cpf,
        full_name: initial.full_name,
        email: initial.email ?? "",
        phone: initial.phone ?? "",
        department: initial.department ?? "",
        job_title: initial.job_title ?? "",
        hired_at: initial.hired_at ?? "",
        notes: initial.notes ?? "",
      });
    } else {
      reset({
        cpf: "",
        full_name: "",
        email: "",
        phone: "",
        department: "",
        job_title: "",
        hired_at: "",
        notes: "",
      });
    }
  }, [open, initial, reset]);

  function emptyToNull<T extends Record<string, any>>(obj: T) {
    const clone: Record<string, any> = { ...obj };
    for (const k of Object.keys(clone)) {
      if (clone[k] === "") clone[k] = null;
    }
    return clone as T;
  }

  async function onSubmit(values: FormValues) {
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      // opcional: exibir o primeiro erro
      const firstErr = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
      if (firstErr) toast.error(firstErr);
      return;
    }

    try {
      // Converte strings vazias para null antes de enviar ao Supabase
      const cleaned = emptyToNull(parsed.data);

      await upsertEmployee({
        ...(cleaned as unknown as Employee),
        // mantém status atual ao editar; "active" por padrão ao admitir
        status: initial?.status ?? "active",
      });

      toast.success(initial ? "Funcionário atualizado!" : "Funcionário admitido!");
      onSuccess?.();
    } catch (err: any) {
      console.error("Erro ao salvar funcionário:", err);
      toast.error(err?.message ?? "Não foi possível salvar o funcionário.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Editar Funcionário" : "Admitir Funcionário"}
          </DialogTitle>
          <DialogDescription>
            Preencha os dados abaixo. O CPF precisa ser único.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>CPF</Label>
              <Input
                placeholder="somente números"
                {...register("cpf")}
                disabled={!!initial}
              />
              {errors.cpf && (
                <p className="text-xs text-destructive mt-1">
                  {errors.cpf.message}
                </p>
              )}
            </div>
            <div>
              <Label>Data de admissão</Label>
              <Input type="date" {...register("hired_at")} />
            </div>
            <div className="sm:col-span-2">
              <Label>Nome completo</Label>
              <Input {...register("full_name")} />
              {errors.full_name && (
                <p className="text-xs text-destructive mt-1">
                  {errors.full_name.message}
                </p>
              )}
            </div>
            <div>
              <Label>E-mail</Label>
              <Input type="email" {...register("email")} />
              {errors.email && (
                <p className="text-xs text-destructive mt-1">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div>
              <Label>Telefone</Label>
              <Input {...register("phone")} />
            </div>
            <div>
              <Label>Departamento</Label>
              <Input {...register("department")} />
            </div>
            <div>
              <Label>Cargo</Label>
              <Input {...register("job_title")} />
            </div>
            <div className="sm:col-span-2">
              <Label>Observações</Label>
              <Input {...register("notes")} />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {initial ? "Salvar alterações" : "Admitir"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
